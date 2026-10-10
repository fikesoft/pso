import { Router } from 'express';
import type {
  SessionOrganization,
  SessionUser,
  TenantLoginLookup,
} from '../../../entities/session';
import {
  auditAuth,
  cookieName,
  cookieOptions,
  hashPassword,
  issueSession,
  loadAuth,
  rateLimit,
  sessionResponse,
  tenantContext,
  token,
  verifyPassword,
} from '../../../entities/session';
import type { AuthRequest, PrincipalKind } from '../../../entities/session';
import { bootstrapDb, platformDb, runtime, withTenantTransaction } from '../../../shared/db';
import { assert } from '../../../shared/lib/http';
import { authenticationLoginSchema } from '../model/authentication.schema';

const dummyHash = hashPassword(token());
export function sessionRoutes(kind: PrincipalKind) {
  const router = Router();
  router.get('/session', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    await sessionResponse(req, res, kind);
  });
  router.post('/login', async (req, res) => {
    const body = authenticationLoginSchema.parse(req.body);
    const login = body.login.normalize('NFKC').trim().toLowerCase();
    const slug = body.companySlug?.trim().toLowerCase();
    await rateLimit(`login:ip:${req.ip}`, 30, undefined, kind);
    await rateLimit(`login:account:${kind}:${slug}:${login}`, 10, undefined, kind);
    let user: SessionUser | null | undefined, organization: SessionOrganization | undefined;
    if (kind === 'TENANT') {
      const rows = await bootstrapDb.$queryRaw<
        TenantLoginLookup[]
      >`SELECT pos_auth.lookup_tenant_login(${slug ?? ''},${login}) AS data`;
      const data = rows[0]?.data;
      if (data) ({ user, organization } = data);
    } else user = await platformDb.platformAdmin.findUnique({ where: { loginNormalized: login } });
    const valid = await verifyPassword(user?.passwordHash ?? (await dummyHash), body.password);
    assert(
      valid &&
        user &&
        (kind !== 'TENANT' || user.authenticationMethod === 'PASSWORD') &&
        user.status === 'ACTIVE' &&
        (!organization || organization.status === 'ACTIVE'),
      401,
      'Date de autentificare invalide',
    );
    assert(
      !user.mustChangePassword ||
        !user.temporaryPasswordExpiresAt ||
        new Date(user.temporaryPasswordExpiresAt).getTime() > Date.now(),
      401,
      'Date de autentificare invalide',
    );
    await issueSession(req, res, kind, user, organization);
    const auth = await loadAuth(req, kind);
    if (auth) await auditAuth(auth, 'auth.login', (req as AuthRequest).requestId);
    await sessionResponse(req, res, kind, auth);
  });
  router.post('/logout', async (req, res) => {
    const auth = await loadAuth(req, kind);
    if (auth) {
      if (kind === 'TENANT')
        await withTenantTransaction(runtime, tenantContext(auth.user), (tx) =>
          tx.tenantSession.update({
            where: { id: auth.session.id },
            data: { revokedAt: new Date() },
          }),
        );
      else
        await platformDb.platformSession.update({
          where: { id: auth.session.id },
          data: { revokedAt: new Date() },
        });
      await auditAuth(auth, 'auth.logout', (req as AuthRequest).requestId);
    }
    res.clearCookie(cookieName(kind), cookieOptions(kind));
    delete req.cookies[cookieName(kind)];
    await sessionResponse(req, res, kind);
  });
  return router;
}
