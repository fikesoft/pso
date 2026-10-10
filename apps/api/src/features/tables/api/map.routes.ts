import type { Router } from 'express';
import { tableMapQuerySchema } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { tableResponse } from '../../../entities/dining-table';
import { requireTableAccess } from '../model/table-access';
import { tableCursor, readTableCursor } from '../model/table-query';
import { canVisit } from '../model/visit-access';
import { visitState } from '../model/visit-detail';
export function addMapRoute(router: Router) {
  router.get(
    '/table-map',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = tableMapQuerySchema.parse(req.query);
        requireTableAccess(access, auth.user.id, query.locationId);
        const context = {
          organizationId: access.org.id,
          actor: auth.user.id,
          locationId: query.locationId,
          status: `MAP:${query.limit}`,
        };
        const after = query.cursor ? readTableCursor(context, query.cursor) : undefined;
        const tables = await tx.diningTable.findMany({
          where: {
            locationId: query.locationId,
            status: 'ACTIVE',
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
        const rows = [];
        for (const table of tables.slice(0, query.limit)) {
          const visit = await tx.tableVisit.findFirst({
            where: { tableId: table.id, status: 'OPEN' },
          });
          rows.push({
            table: tableResponse(table),
            ...(visit
              ? await visitState(tx, visit)
              : { state: 'FREE', hasReadyFood: false, hasWaitingFood: false }),
            visit: visit
              ? {
                  id: visit.id,
                  version: visit.version,
                  guestCount: visit.guestCount,
                  waiter: { id: visit.waiterUserId, displayName: visit.waiterDisplayName },
                  billRequested: visit.billRequested,
                  openedAt: visit.openedAt.toISOString(),
                }
              : null,
            actions: {
              open: !visit && canVisit(access, auth.user.id, query.locationId),
              view: !!visit,
            },
          });
        }
        return {
          tables: rows,
          nextCursor:
            tables.length > query.limit ? tableCursor(context, tables[query.limit - 1]!) : null,
          timezone: access.locations.find((row) => row.id === query.locationId)!.timezone,
        };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
