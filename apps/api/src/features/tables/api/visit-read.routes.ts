import type { Router } from 'express';
import {
  idSchema,
  tableVisitDetailSchema,
  tableVisitHistorySchema,
  tableWaiterListSchema,
} from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { visitEventResponse } from '../../../entities/table-visit';
import { requireTableAccess } from '../model/table-access';
import { readVisit, requireVisitAccess, waiterEligible } from '../model/visit-access';
import { visitDetail } from '../model/visit-detail';
import { readVisitCursor, visitCursor } from '../model/visit-cursor';
import { assert } from '../../../shared/lib/http';
export function addVisitReadRoutes(router: Router) {
  router.get(
    '/table-visits/:id',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = tableVisitDetailSchema.parse(req.query);
        requireTableAccess(access, auth.user.id, query.locationId);
        return visitDetail(
          tx,
          access,
          auth.user.id,
          await readVisit(tx, query.locationId, idSchema.parse(req.params.id)),
        );
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/table-visits/:id/events',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = tableVisitHistorySchema.parse(req.query),
          id = idSchema.parse(req.params.id);
        requireTableAccess(access, auth.user.id, query.locationId);
        await readVisit(tx, query.locationId, id);
        const context = [
          access.org.id,
          auth.user.id,
          query.locationId,
          id,
          'EVENTS',
          String(query.limit),
        ];
        const before = readVisitCursor(context, query.cursor);
        assert(before === undefined || typeof before === 'number', 400, 'Cursor invalid');
        const rows = await tx.tableVisitEvent.findMany({
          where: {
            visitId: id,
            locationId: query.locationId,
            ...(typeof before === 'number' ? { resultVersion: { lt: before } } : {}),
          },
          orderBy: { resultVersion: 'desc' },
          take: query.limit + 1,
        });
        return {
          events: rows.slice(0, query.limit).map(visitEventResponse),
          nextCursor:
            rows.length > query.limit
              ? visitCursor(context, rows[query.limit - 1]!.resultVersion)
              : null,
          timezone: access.locations.find((row) => row.id === query.locationId)!.timezone,
        };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/table-visit-waiters',
    endpoint(
      async (_tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = tableWaiterListSchema.parse(req.query);
        requireVisitAccess(access, auth.user.id, query.locationId, true);
        const context = [
          access.org.id,
          auth.user.id,
          query.locationId,
          'WAITERS',
          String(query.limit),
        ];
        const after = readVisitCursor(context, query.cursor);
        assert(after === undefined || typeof after === 'string', 400, 'Cursor invalid');
        const rows = access.users
          .filter(
            (row) => waiterEligible(access, row.id, query.locationId) && (!after || row.id > after),
          )
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, query.limit + 1);
        return {
          waiters: rows
            .slice(0, query.limit)
            .map((row) => ({ id: row.id, displayName: row.displayName })),
          nextCursor:
            rows.length > query.limit ? visitCursor(context, rows[query.limit - 1]!.id) : null,
        };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
