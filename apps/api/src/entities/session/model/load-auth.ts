import type { Prisma } from '@pos/db';
import type { NextFunction, Request, Response } from 'express';
import { MINUTE_MS } from '../../../shared/config';
import { bootstrapDb, platformDb, runtime, withTenantTransaction } from '../../../shared/db';
import { assert } from '../../../shared/lib/http';
import { SESSION_POLICY } from '../config/session.constants';
import { hashToken } from '../lib/crypto';
import { cookieName } from './csrf';
import type {
  AuthRequest,
  AuthState,
  PrincipalKind,
  SessionOrganization,
  SessionRecord,
  SessionUser,
  TenantSessionLookup,
} from './session.types';
import { tenantContext } from './tenant-context';
async function mfaCredential(kind: PrincipalKind, user: SessionUser) {
  return kind === 'TENANT'
    ? withTenantTransaction(runtime, tenantContext(user), (tx) =>
        tx.mfaCredential.findFirst({
          where: { userId: user.id, status: { in: ['ACTIVE', 'PENDING'] } },
        }),
      )
    : platformDb.mfaCredential.findFirst({
        where: { platformAdminId: user.id, status: { in: ['ACTIVE', 'PENDING'] } },
      });
}
export async function loadAuth(req: Request, kind: PrincipalKind): Promise<AuthState | undefined> {
  const raw = req.cookies[cookieName(kind)];
  return loadAuthToken(raw, kind, req.headers['x-pos-background'] !== 'true');
}

export async function loadAuthToken(
  raw: unknown,
  kind: PrincipalKind,
  touchIdle = true,
): Promise<AuthState | undefined> {
  if (typeof raw !== 'string') return;
  let session: SessionRecord | null | undefined,
    user: SessionUser | null | undefined,
    organization: SessionOrganization | undefined;
  if (kind === 'TENANT') {
    const result = await bootstrapDb.$queryRaw<
      TenantSessionLookup[]
    >`SELECT pos_auth.lookup_tenant_session(${hashToken(raw)}) AS data`;
    const data = result[0]?.data;
    if (!data) return;
    ({ session, user, organization } = data);
  } else {
    session = await platformDb.platformSession.findUnique({ where: { tokenHash: hashToken(raw) } });
    if (!session) return;
    const platformSession = session as Prisma.PlatformSessionGetPayload<Record<string, never>>;
    user = await platformDb.platformAdmin.findUnique({
      where: { id: platformSession.platformAdminId },
    });
  }
  const now = Date.now();
  if (
    !user ||
    user.status !== 'ACTIVE' ||
    session.revokedAt ||
    new Date(session.expiresAt).getTime() <= now ||
    new Date(session.idleExpiresAt).getTime() <= now ||
    session.authVersion !== user.authVersion ||
    (organization && organization.status !== 'ACTIVE')
  )
    return;
  if (
    kind === 'TENANT' &&
    ((session.authenticationMethod ?? 'PASSWORD') !== (user.authenticationMethod ?? 'PASSWORD') ||
      (user.authenticationMethod === 'PIN' &&
        (user.isPrimaryAdmin || user.mfaRequired || user.mustChangePassword)))
  )
    return;
  const credential = await mfaCredential(kind, user);
  const mfaRequired = kind === 'PLATFORM' || user.isPrimaryAdmin || user.mfaRequired;
  const stage = user.mustChangePassword
    ? 'password'
    : mfaRequired
      ? credential?.status !== 'ACTIVE'
        ? 'enroll'
        : !session.mfaVerifiedAt
          ? 'mfa'
          : 'ready'
      : 'ready';
  const idleExpiresAt = new Date(
    Math.min(
      new Date(session.expiresAt).getTime(),
      now + SESSION_POLICY[kind].idleMinutes * MINUTE_MS,
    ),
  );
  if (touchIdle && kind === 'TENANT')
    await withTenantTransaction(runtime, tenantContext(user), (tx) =>
      tx.tenantSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), idleExpiresAt },
      }),
    );
  else if (touchIdle)
    await platformDb.platformSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), idleExpiresAt },
    });
  return { kind, user, organization, session, credential, rawToken: raw, stage };
}
export function authMiddleware(kind: PrincipalKind, ready = true) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const auth = await loadAuth(req, kind);
      assert(auth, 401, 'Autentificare necesară');
      if (ready)
        assert(auth.stage === 'ready', 403, 'Finalizați schimbarea parolei și verificarea MFA');
      (req as AuthRequest).auth = auth;
      next();
    } catch (error) {
      next(error);
    }
  };
}
