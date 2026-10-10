import type { Router } from 'express';
import { cashShiftListSchema, cashShiftDetailSchema, idSchema } from '@pos/contracts';
import { endpoint, scopeFor } from '../../../entities/tenant-access';
import {
  requireShiftRead,
  readShiftSummary,
  shiftResponse,
  closingResponse,
} from '../../../entities/cash-shift';
import { assert } from '../../../shared/lib/http';
import { readShiftCursor, shiftCursor } from '../model/shift-cursor';
export function addShiftReadRoutes(router: Router) {
  router.get(
    '/cash-shifts',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = cashShiftListSchema.parse(req.query);
        requireShiftRead(access.service, access.org.id, auth.user.id, query.locationId);
        if (query.view === 'ALL')
          assert(
            access.service.canUse(
              auth.user.id,
              'cash.reports.read',
              scopeFor(access.org.id, { scopeType: 'LOCATION', locationId: query.locationId }),
            ),
          );
        const context = { organizationId: access.org.id, actor: auth.user.id, ...query };
        const after = query.cursor ? readShiftCursor(context, query.cursor) : undefined;
        const rows = await tx.cashShift.findMany({
          where: {
            locationId: query.locationId,
            ...(query.view === 'MINE' ? { ownerUserId: auth.user.id } : {}),
            ...(query.status === 'ALL' ? {} : { status: query.status }),
            ...(query.registerId ? { registerId: query.registerId } : {}),
            ...(after
              ? {
                  OR: [
                    { openedAt: { lt: new Date(after.openedAt) } },
                    { openedAt: new Date(after.openedAt), id: { lt: after.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
          take: query.limit + 1,
        });
        const page = rows.slice(0, query.limit);
        return {
          shifts: page.map(shiftResponse),
          nextCursor: rows.length > query.limit ? shiftCursor(context, page.at(-1)!) : null,
        };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/cash-shifts/:id',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = cashShiftDetailSchema.parse(req.query),
          id = idSchema.parse(req.params.id);
        const shift = await tx.cashShift.findFirst({ where: { id, locationId: query.locationId } });
        assert(shift, 404, 'Tura nu există');
        requireShiftRead(
          access.service,
          access.org.id,
          auth.user.id,
          query.locationId,
          shift.ownerUserId,
        );
        const closing = await tx.cashClosing.findFirst({ where: { shiftId: id } });
        return {
          shift: shiftResponse(shift),
          summary: await readShiftSummary(tx, access.org.id, id),
          closing: closing ? closingResponse(closing) : null,
        };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
