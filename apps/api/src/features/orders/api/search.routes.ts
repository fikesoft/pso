import { orderSearchSchema } from '@pos/contracts';
import type { Router } from 'express';
import { orderResponse } from '../../../entities/order';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireOrderPermission } from '../model/order-authorization';
import { decodeOrderCursor } from '../model/order-search-cursor';
import { orderSearchFilters } from '../model/order-search-filters';
import { scanReadableOrders } from '../model/order-scan';
import type { OrderCursorContext } from '../model/order-search.types';

export function addOrderSearchRoute(router: Router) {
  router.post(
    '/orders/search',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = orderSearchSchema.parse(req.body);
        requireOrderPermission(access, auth.user.id, query.locationId, 'orders.read');
        const location = await tx.location.findUnique({ where: { id: query.locationId } });
        assert(location, 404, 'Locația nu există');
        const { where, fingerprint } = await orderSearchFilters(
          tx,
          access.org.id,
          query,
          location.timezone,
        );
        const context: OrderCursorContext = {
          organizationId: access.org.id,
          locationId: query.locationId,
          userId: auth.user.id,
          kind: 'SEARCH',
          fingerprint,
        };
        const page = await scanReadableOrders(tx, access, {
          where,
          context,
          limit: query.limit,
          ...(query.cursor ? { before: decodeOrderCursor(context, query.cursor) } : {}),
        });
        return {
          orders: await Promise.all(page.orders.map((order) => orderResponse(tx, order, true))),
          nextCursor: page.nextCursor,
          timezone: location.timezone,
        };
      },
      { readOnly: true },
    ),
  );
}
