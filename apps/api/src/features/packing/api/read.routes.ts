import { idSchema, packingListQuerySchema } from '@pos/contracts';
import type { Router } from 'express';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requirePackingPermission } from '../model/packing-authorization';
import { packingResponse } from '../model/packing-response';

export function addPackingReadRoutes(router: Router) {
  router.get(
    '/packing/sessions',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = packingListQuerySchema.parse(req.query);
        const scope = { organizationId: access.org.id, locationId: query.locationId };
        const location = await tx.location.findFirst({
          where: { id: query.locationId, organizationId: access.org.id },
        });
        assert(location, 404, 'Locația nu există.');
        requirePackingPermission(access, auth.user.id, query.locationId, 'packing.read');
        const cursor = query.cursor
          ? await tx.packingSession.findFirst({ where: { ...scope, id: query.cursor } })
          : null;
        assert(!query.cursor || cursor, 400, 'Cursorul nu aparține acestei locații.');
        const sessions = await tx.packingSession.findMany({
          where: {
            ...scope,
            status: query.status === 'ACTIVE' ? { in: ['WAITING', 'PACKING'] } : query.status,
            ...(cursor
              ? {
                  OR: [
                    { createdAt: { gt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: query.limit + 1,
        });
        return {
          sessions: await Promise.all(
            sessions.slice(0, query.limit).map((session) => packingResponse(tx, session)),
          ),
          nextCursor: sessions.length > query.limit ? sessions[query.limit - 1]!.id : null,
        };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/packing/sessions/:id',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const id = idSchema.parse(req.params.id);
        const session = await tx.packingSession.findFirst({
          where: { organizationId: access.org.id, id },
        });
        assert(session, 404, 'Sesiunea nu există.');
        requirePackingPermission(access, auth.user.id, session.locationId, 'packing.read');
        return { session: await packingResponse(tx, session) };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
