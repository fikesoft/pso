import { orderCreatorsQuerySchema } from '@pos/contracts';
import type { Router } from 'express';
import { endpoint } from '../../../entities/tenant-access';
import { requireOrderPermission } from '../model/order-authorization';
import { decodeOrderCursor, orderFilterFingerprint } from '../model/order-search-cursor';
import { scanReadableOrders } from '../model/order-scan';
import type { OrderCursorContext } from '../model/order-search.types';

export function addOrderCreatorsRoute(router: Router) {
  router.get(
    '/orders/creators',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = orderCreatorsQuerySchema.parse(req.query);
      requireOrderPermission(access, auth.user.id, query.locationId, 'orders.read');
      const where = { organizationId: access.org.id, locationId: query.locationId };
      const context: OrderCursorContext = {
        ...where,
        userId: auth.user.id,
        kind: 'CREATORS',
        fingerprint: orderFilterFingerprint(where),
      };
      const page = await scanReadableOrders(tx, access, {
        where,
        context,
        limit: query.limit,
        distinctCreators: true,
        ...(query.cursor ? { before: decodeOrderCursor(context, query.cursor) } : {}),
      });
      const users = await tx.companyUser.findMany({
        where: { id: { in: page.orders.map((order) => order.createdByUserId) } },
        select: { id: true, displayName: true },
      });
      const names = new Map(users.map((user) => [user.id, user.displayName]));
      return {
        creators: page.orders.map((order) => ({
          id: order.createdByUserId,
          displayName: names.get(order.createdByUserId) ?? 'Utilizator necunoscut',
        })),
        nextCursor: page.nextCursor,
      };
    }),
  );
}
