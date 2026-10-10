import type { Router } from 'express';
import { Prisma } from '@pos/db';
import { idSchema, tableVisitOrderQuerySchema } from '@pos/contracts';
import { endpoint, scopeFor } from '../../../entities/tenant-access';
import { visitMemberIds } from '../../../entities/table-visit';
import { orderResponse } from '../../../entities/order';
import { assert } from '../../../shared/lib/http';
import { requireTableAccess } from '../model/table-access';
import { readVisit } from '../model/visit-access';
import { readVisitCursor, visitCursor } from '../model/visit-cursor';
import { VISIT_ORDER_SCAN_BUDGET } from '../config/visit.constants';
export function addVisitOrderRoute(router: Router) {
  router.get(
    '/table-visits/:id/orders',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = tableVisitOrderQuerySchema.parse(req.query),
          id = idSchema.parse(req.params.id);
        requireTableAccess(access, auth.user.id, query.locationId);
        const scope = scopeFor(access.org.id, {
          scopeType: 'LOCATION',
          locationId: query.locationId,
        });
        assert(access.service.canUse(auth.user.id, 'orders.read', scope));
        const visit = await readVisit(tx, query.locationId, id);
        const context = [
          access.org.id,
          auth.user.id,
          query.locationId,
          id,
          'ORDERS',
          String(visit.version),
          query.statusGroup,
          String(query.limit),
        ];
        const before = readVisitCursor(context, query.cursor);
        assert(before === undefined || typeof before === 'number', 400, 'Cursor invalid');
        const rows = await tx.order.findMany({
          where: {
            locationId: query.locationId,
            tableVisitId: { in: await visitMemberIds(tx, access.org.id, query.locationId, id) },
            ...(typeof before === 'number' ? { number: { lt: before } } : {}),
          },
          orderBy: { number: 'desc' },
          take: VISIT_ORDER_SCAN_BUDGET + 1,
        });
        const orders = [];
        let nextCursor: string | null = null;
        for (const [index, order] of rows.slice(0, VISIT_ORDER_SCAN_BUDGET).entries()) {
          if (
            access.service.canUse(auth.user.id, 'orders.read', {
              ...scope,
              amount: order.total.toString(),
            })
          ) {
            const dto = await orderResponse(tx, order, true);
            if (
              query.statusGroup === 'ALL' ||
              (dto.status !== 'CANCELLED' &&
                (dto.status !== 'COMPLETED' ||
                  !new Prisma.Decimal(dto.paymentSummary.outstandingAmount).isZero()))
            )
              orders.push(dto);
          }
          if (orders.length === query.limit || index === VISIT_ORDER_SCAN_BUDGET - 1) {
            if (index < rows.length - 1) nextCursor = visitCursor(context, order.number);
            break;
          }
        }
        return {
          orders,
          nextCursor,
          timezone: access.locations.find((row) => row.id === query.locationId)!.timezone,
        };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
