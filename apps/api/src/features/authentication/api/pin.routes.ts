import { pinLoginSchema } from '@pos/contracts';
import { Router } from 'express';
import type { AuthRequest, TenantLoginLookup } from '../../../entities/session';
import {
  hashPassword,
  hashToken,
  INVALID_PIN_MESSAGE,
  loadAuth,
  PIN_RATE_LIMIT,
  prepareSession,
  rateLimit,
  sessionResponse,
  setSessionCookie,
  staffPinLookup,
  token,
  verifyPassword,
} from '../../../entities/session';
import { loadAuthorization } from '../../../entities/tenant-access';
import { bootstrapDb, runtime, withTenantTransaction } from '../../../shared/db';
import { assert } from '../../../shared/lib/http';

const dummyPinHash = hashPassword(token());

export function pinRoutes() {
  return Router().post('/pin', async (req, res) => {
    const { companySlug, pin } = pinLoginSchema.parse(req.body);
    const lookup = staffPinLookup(companySlug, pin);
    await rateLimit(`pin:ip:${req.ip}`, PIN_RATE_LIMIT.ip);
    await rateLimit(`pin:company:${hashToken(companySlug)}`, PIN_RATE_LIMIT.company);
    await rateLimit(`pin:credential:${lookup}`, PIN_RATE_LIMIT.credential);
    const result = await bootstrapDb.$queryRaw<TenantLoginLookup[]>`
      SELECT pos_auth.lookup_tenant_pin(${companySlug},${lookup}) AS data`;
    const candidate = result[0]?.data;
    const valid = await verifyPassword(candidate?.user.pinHash ?? (await dummyPinHash), pin);
    assert(valid && candidate && candidate.user.organizationId, 401, INVALID_PIN_MESSAGE);
    const session = await withTenantTransaction(
      runtime,
      {
        organizationId: candidate.user.organizationId,
        userId: candidate.user.id,
      },
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${candidate.user.organizationId},0))`;
        const policy = await loadAuthorization(tx, candidate.user.organizationId!);
        const user = policy.users.find((entry) => entry.id === candidate.user.id);
        assert(
          user &&
            user.status === 'ACTIVE' &&
            policy.org.status === 'ACTIVE' &&
            user.authenticationMethod === 'PIN' &&
            user.pinLookup === lookup &&
            user.pinHash === candidate.user.pinHash &&
            user.authVersion === candidate.user.authVersion &&
            !user.isPrimaryAdmin &&
            !user.mfaRequired &&
            !user.mustChangePassword &&
            !policy.service.requiresMfa(user.id),
          401,
          INVALID_PIN_MESSAGE,
        );
        const prepared = prepareSession('TENANT', user);
        await tx.tenantSession.create({
          data: {
            ...prepared.data,
            authenticationMethod: 'PIN',
            organizationId: policy.org.id,
            userId: user.id,
            policyVersion: policy.org.policyVersion,
          },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: policy.org.id,
            actorUserId: user.id,
            action: 'auth.pin.login',
            targetType: 'USER',
            targetId: user.id,
            outcome: 'SUCCESS',
            requestId: (req as AuthRequest).requestId,
            metadata: {},
          },
        });
        return prepared;
      },
    );
    setSessionCookie(req, res, 'TENANT', session.raw, session.data.expiresAt);
    const auth = await loadAuth(req, 'TENANT');
    assert(auth, 401, INVALID_PIN_MESSAGE);
    await sessionResponse(req, res, 'TENANT', auth);
  });
}
