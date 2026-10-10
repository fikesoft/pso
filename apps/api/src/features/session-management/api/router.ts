import { Router } from 'express';
import type { Prisma } from '@pos/db';
import { idSchema, listSessionsSchema, revokeAllSessionsSchema } from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function sessionManagementRouter() {
  const router = Router();
  router.get(
    '/sessions',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = listSessionsSchema.parse(req.query);
      const userId = query.userId ?? auth.user.id;
      assert(
        access.users.some((user) => user.id === userId),
        404,
      );
      assert(
        userId === auth.user.id ||
          access.service.canManageUser(auth.user.id, userId, 'resetPassword'),
      );
      const now = new Date();
      const where: Prisma.TenantSessionWhereInput = {
        organizationId: access.org.id,
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
      };
      if (query.cursor)
        assert(await tx.tenantSession.findFirst({ where: { ...where, id: query.cursor } }), 400);
      const rows = await tx.tenantSession.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
          idleExpiresAt: true,
          authenticationMethod: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      return {
        sessions: page.map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          lastSeenAt: row.lastSeenAt,
          expiresAt: row.expiresAt,
          idleExpiresAt: row.idleExpiresAt,
          authenticationMethod: row.authenticationMethod === 'PIN' ? 'PIN' : 'PASSWORD',
          current: row.id === auth.session.id,
        })),
        nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    }),
  );
  router.delete(
    '/sessions/:id',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const now = new Date();
      const row = await tx.tenantSession.findFirst({
        where: {
          id,
          organizationId: access.org.id,
          revokedAt: null,
          expiresAt: { gt: now },
          idleExpiresAt: { gt: now },
        },
        select: { userId: true },
      });
      assert(
        row &&
          (row.userId === auth.user.id ||
            access.service.canManageUser(auth.user.id, row.userId, 'resetPassword')),
        404,
      );
      const updated = await tx.tenantSession.updateMany({
        where: { id, organizationId: access.org.id, revokedAt: null },
        data: { revokedAt: now },
      });
      assert(updated.count === 1, 404);
      await audit(tx, auth, req, 'session.revoked', 'SESSION', id);
      return { revoked: 1, currentRevoked: id === auth.session.id };
    }),
  );
  router.post(
    '/sessions/revoke-all',
    endpoint(async (tx, access, auth, req) => {
      const body = revokeAllSessionsSchema.parse(req.body);
      const userId = body.userId ?? auth.user.id;
      assert(
        access.users.some((user) => user.id === userId),
        404,
      );
      assert(
        userId === auth.user.id ||
          access.service.canManageUser(auth.user.id, userId, 'resetPassword'),
      );
      const now = new Date();
      const updated = await tx.tenantSession.updateMany({
        where: {
          organizationId: access.org.id,
          userId,
          revokedAt: null,
          expiresAt: { gt: now },
          idleExpiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });
      await audit(tx, auth, req, 'session.all.revoked', 'USER', userId);
      return { revoked: updated.count, currentRevoked: userId === auth.user.id };
    }),
  );
  return router;
}
