import { Router } from 'express';
import {
  auditAuth,
  authMiddleware,
  hashPassword,
  issueSession,
  rateLimit,
  sessionResponse,
  tenantContext,
  verifyPassword,
} from '../../../entities/session';
import type { AuthRequest, PrincipalKind } from '../../../entities/session';
import { platformDb, runtime, withTenantTransaction } from '../../../shared/db';
import { assert } from '../../../shared/lib/http';

import { authenticationPasswordSchema } from '../model/authentication.schema';
import { requireFreshPasswordAuth } from '../model/fresh-auth';
export function passwordRoutes(kind: PrincipalKind) {
  const router = Router();
  router.post('/password', authMiddleware(kind, false), async (req, res) => {
    const auth = (req as AuthRequest).auth!;
    assert(auth.user.authenticationMethod !== 'PIN', 403, 'PIN-ul se schimbă prin administrator');
    const body = authenticationPasswordSchema.parse(req.body);
    await rateLimit(`password:${auth.user.id}`, 6, undefined, kind);
    assert(
      await verifyPassword(auth.user.passwordHash, body.currentPassword),
      401,
      'Parola actuală este incorectă',
    );
    assert(body.currentPassword !== body.newPassword, 400, 'Alegeți o parolă nouă');
    const passwordHash = await hashPassword(body.newPassword);
    if (kind === 'TENANT')
      await withTenantTransaction(runtime, tenantContext(auth.user), async (tx) => {
        await requireFreshPasswordAuth(tx, auth);
        await tx.companyUser.update({
          where: { id: auth.user.id },
          data: {
            passwordHash,
            mustChangePassword: false,
            temporaryPasswordExpiresAt: null,
            activatedAt: new Date(),
            authVersion: { increment: 1 },
          },
        });
        await tx.tenantSession.updateMany({
          where: { userId: auth.user.id },
          data: { revokedAt: new Date() },
        });
      });
    else
      await platformDb.$transaction(async (tx) => {
        await requireFreshPasswordAuth(tx, auth);
        await tx.platformAdmin.update({
          where: { id: auth.user.id },
          data: { passwordHash, mustChangePassword: false, authVersion: { increment: 1 } },
        });
        await tx.platformSession.updateMany({
          where: { platformAdminId: auth.user.id },
          data: { revokedAt: new Date() },
        });
      });
    await auditAuth(auth, 'auth.password.changed', (req as AuthRequest).requestId);
    await issueSession(
      req,
      res,
      kind,
      {
        ...auth.user,
        passwordHash,
        mustChangePassword: false,
        authVersion: auth.user.authVersion + 1,
      },
      auth.organization,
    );
    await sessionResponse(req, res, kind);
  });
  return router;
}
