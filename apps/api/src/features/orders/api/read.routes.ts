import { idSchema, orderQuerySchema } from '@pos/contracts';
import type { Router } from 'express';
import { orderResponse, orderStatusFilter } from '../../../entities/order';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireOrderPermission } from '../model/order-authorization';
import { decodeOrderCursor, orderFilterFingerprint } from '../model/order-search-cursor';
import { scanReadableOrders } from '../model/order-scan';
import type { OrderCursorContext } from '../model/order-search.types';

export function addOrderReadRoutes(router: Router) {
  router.get(
    '/orders',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = orderQuerySchema.parse(req.query);
      requireOrderPermission(access, auth.user.id, query.locationId, 'orders.read');
      const where = {
        organizationId: access.org.id,
        locationId: query.locationId,
        ...(query.status ? orderStatusFilter(query.status) : {}),
      };
      const context: OrderCursorContext = {
        organizationId: access.org.id,
        locationId: query.locationId,
        userId: auth.user.id,
        kind: 'LIST',
        fingerprint: orderFilterFingerprint(where),
      };
      let before: number | undefined;
      if (query.cursor) {
        if (idSchema.safeParse(query.cursor).success) {
          const legacy = await tx.order.findFirst({
            where: { id: query.cursor, locationId: query.locationId },
            select: { number: true },
          });
          assert(legacy, 400, 'Cursorul de paginare nu este valid pentru această locație');
          before = legacy.number;
        } else before = decodeOrderCursor(context, query.cursor);
      }
      const page = await scanReadableOrders(tx, access, {
        where,
        context,
        limit: query.limit,
        ...(before === undefined ? {} : { before }),
      });
      return {
        orders: await Promise.all(page.orders.map((order) => orderResponse(tx, order, true))),
        nextCursor: page.nextCursor,
      };
    }),
  );
  router.get(
    '/orders/:id',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id);
      const order = await tx.order.findUnique({ where: { id } });
      assert(order, 404, 'Comanda nu există');
      requireOrderPermission(
        access,
        auth.user.id,
        order.locationId,
        'orders.read',
        order.total.toFixed(2),
      );
      return { order: await orderResponse(tx, order, true) };
    }),
  );
}
