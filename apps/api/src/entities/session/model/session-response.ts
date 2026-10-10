import type { Request, Response } from 'express';
import { MINUTE_MS } from '../../../shared/config';
import { platformDb, runtime, withTenantTransaction } from '../../../shared/db';
import { assert } from '../../../shared/lib/http';
import { SESSION_POLICY } from '../config/session.constants';
import { csrf, hashToken, token } from '../lib/crypto';
import { cookieName, cookieOptions, seed } from './csrf';
import { loadAuth } from './load-auth';
import { safeOrganization, safeUser } from './public-identity';
import type { AuthState, PrincipalKind, SessionOrganization, SessionUser } from './session.types';
import { tenantContext } from './tenant-context';
export async function sessionResponse(
  req: Request,
  res: Response,
  kind: PrincipalKind,
  auth?: AuthState,
) {
  const state = auth ?? (await loadAuth(req, kind));
  return res.json({
    user: state
      ? { ...safeUser(state.user), mfaEnrolled: state.credential?.status === 'ACTIVE' }
      : null,
    organization: state?.organization ? safeOrganization(state.organization) : undefined,
    csrfToken: csrf(state?.rawToken ?? seed(req, res, kind)),
    stage: state?.stage,
  });
}
export async function issueSession(
  req: Request,
  res: Response,
  kind: PrincipalKind,
  user: SessionUser,
  organization?: SessionOrganization,
) {
  const { raw, data } = prepareSession(kind, user);
  if (kind === 'TENANT') {
    const context = tenantContext(user);
    assert(organization, 401, 'Compania lipsește');
    await withTenantTransaction(runtime, tenantContext(user), async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${context.organizationId},0))`;
      const current = await tx.companyUser.findUnique({ where: { id: user.id } });
      const company = await tx.organization.findUnique({ where: { id: context.organizationId } });
      assert(
        current &&
          current.status === 'ACTIVE' &&
          company?.status === 'ACTIVE' &&
          current.authenticationMethod === 'PASSWORD' &&
          current.authVersion === user.authVersion &&
          current.passwordHash === user.passwordHash,
        401,
        'Date de autentificare invalide',
      );
      await tx.tenantSession.create({
        data: {
          ...data,
          authenticationMethod: user.authenticationMethod ?? 'PASSWORD',
          organizationId: context.organizationId,
          userId: user.id,
          policyVersion: company.policyVersion,
        },
      });
    });
  } else await platformDb.platformSession.create({ data: { ...data, platformAdminId: user.id } });
  setSessionCookie(req, res, kind, raw, data.expiresAt);
}

export function prepareSession(kind: PrincipalKind, user: SessionUser) {
  const raw = token();
  const duration = SESSION_POLICY[kind].durationMinutes;
  const expiresAt = new Date(Date.now() + duration * MINUTE_MS);
  const data = {
    tokenHash: hashToken(raw),
    authVersion: user.authVersion,
    expiresAt,
    idleExpiresAt: new Date(Date.now() + SESSION_POLICY[kind].idleMinutes * MINUTE_MS),
    lastSeenAt: new Date(),
  };
  return { raw, data };
}

export function setSessionCookie(
  req: Request,
  res: Response,
  kind: PrincipalKind,
  raw: string,
  expiresAt: Date,
) {
  res.cookie(cookieName(kind), raw, { ...cookieOptions(kind), expires: expiresAt });
  req.cookies[cookieName(kind)] = raw;
}
