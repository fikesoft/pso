import type { Router } from 'express';
import { diningTableListSchema } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { tableResponse } from '../../../entities/dining-table';
import { requireTableAccess } from '../model/table-access';
import { tableCursor, readTableCursor } from '../model/table-query';
export function addTableReadRoutes(router: Router) {
  router.get(
    '/dining-tables',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = diningTableListSchema.parse(req.query);
      requireTableAccess(access, auth.user.id, query.locationId, query.status !== 'ACTIVE');
      const context = {
        organizationId: access.org.id,
        actor: auth.user.id,
        locationId: query.locationId,
        status: query.status,
      };
      const after = query.cursor ? readTableCursor(context, query.cursor) : undefined;
      const rows = await tx.diningTable.findMany({
        where: {
          locationId: query.locationId,
          status: query.status,
          ...(after
            ? {
                OR: [
                  { sortOrder: { gt: after.sortOrder } },
                  { sortOrder: after.sortOrder, code: { gt: after.code } },
                  { sortOrder: after.sortOrder, code: after.code, id: { gt: after.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      return {
        tables: page.map(tableResponse),
        timezone:
          access.locations.find((location) => location.id === query.locationId)?.timezone ??
          access.org.timezone,
        nextCursor: rows.length > query.limit ? tableCursor(context, page.at(-1)!) : null,
      };
    }),
  );
}
