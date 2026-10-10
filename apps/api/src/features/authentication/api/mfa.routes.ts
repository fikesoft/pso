import type { TenantTransaction } from '@pos/db';
import { Router } from 'express';
import {
  auditAuth,
  authMiddleware,
  decrypt,
  encrypt,
  newTotp,
  rateLimit,
  sessionResponse,
  tenantContext,
  verifyTotp,
} from '../../../entities/session';
import type { AuthRequest, PrincipalKind } from '../../../entities/session';
import { platformDb, runtime, withTenantTransaction } from '../../../shared/db';
import { assert } from '../../../shared/lib/http';
import { authenticationMfaSchema } from '../model/authentication.schema';
import { requireFreshMfaAuth } from '../model/fresh-auth';

export function mfaRoutes(kind: PrincipalKind) {
  const router = Router();
  router.post('/mfa/enroll', authMiddleware(kind, false), async (req, res) => {
    const auth = (req as AuthRequest).auth!;
    assert(auth.user.authenticationMethod !== 'PIN', 403, 'MFA necesită autentificare cu parolă');
    assert(auth.stage === 'enroll', 403, 'Înrolarea MFA nu este disponibilă');
    await rateLimit(`enroll:${auth.user.id}`, 5, undefined, kind);
    const totp = newTotp(`${auth.organization?.slug ?? 'platform'}:${auth.user.loginNormalized}`);
    const data = { encryptedSecret: encrypt(totp.secret.base32), status: 'PENDING' };
    const enroll = async (tx: TenantTransaction) => {
      await requireFreshMfaAuth(tx, auth);
      if (auth.credential) {
        const changed = await tx.mfaCredential.updateMany({
          where: {
            id: auth.credential.id,
            status: 'PENDING',
            encryptedSecret: auth.credential.encryptedSecret,
          },
          data,
        });
        assert(changed.count === 1, 409, 'Configurarea MFA s-a schimbat. Reîncărcați.');
      } else
        await tx.mfaCredential.create({
          data: {
            ...data,
            principalType: kind,
            ...(kind === 'TENANT'
              ? { organizationId: auth.user.organizationId, userId: auth.user.id }
              : { platformAdminId: auth.user.id }),
          },
        });
    };
    if (kind === 'TENANT') await withTenantTransaction(runtime, tenantContext(auth.user), enroll);
    else await platformDb.$transaction(enroll);
    res.json({ secret: totp.secret.base32, otpauthUri: totp.toString() });
  });
  router.post('/mfa/verify', authMiddleware(kind, false), async (req, res) => {
    const auth = (req as AuthRequest).auth!;
    assert(auth.user.authenticationMethod !== 'PIN', 403, 'MFA necesită autentificare cu parolă');
    const { code } = authenticationMfaSchema.parse(req.body);
    assert(auth.stage === 'enroll' || auth.stage === 'mfa', 403);
    assert(auth.credential, 400, 'Începeți configurarea MFA');
    await rateLimit(`mfa:${req.ip}`, 30, undefined, kind);
    await rateLimit(`mfa:user:${auth.user.id}`, 6, undefined, kind);
    const step = verifyTotp(
      decrypt(auth.credential.encryptedSecret),
      code,
      auth.credential.lastUsedStep === null ? null : BigInt(auth.credential.lastUsedStep),
    );
    assert(step !== null, 401, 'Cod invalid sau deja utilizat');
    const credential = auth.credential;
    const update = async (tx: TenantTransaction) => {
      await requireFreshMfaAuth(tx, auth);
      const changed = await tx.mfaCredential.updateMany({
        where: {
          id: credential.id,
          encryptedSecret: credential.encryptedSecret,
          status: credential.status,
          OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
        },
        data: { status: 'ACTIVE', lastUsedStep: step, activatedAt: new Date() },
      });
      assert(changed.count === 1, 401, 'Cod deja utilizat');
      const sessionUpdate = { where: { id: auth.session.id }, data: { mfaVerifiedAt: new Date() } };
      if (kind === 'TENANT') await tx.tenantSession.update(sessionUpdate);
      else await tx.platformSession.update(sessionUpdate);
    };
    if (kind === 'TENANT') await withTenantTransaction(runtime, tenantContext(auth.user), update);
    else await platformDb.$transaction(update);
    await auditAuth(auth, 'auth.mfa.verified', (req as AuthRequest).requestId);
    await sessionResponse(req, res, kind);
  });
  return router;
}
