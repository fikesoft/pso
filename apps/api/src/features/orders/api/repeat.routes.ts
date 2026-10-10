import {
  idSchema,
  orderRepeatPreviewSchema,
  orderLastCustomerOrderQuerySchema,
} from '@pos/contracts';
import type { Router } from 'express';
import { endpoint, visibleLocations } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireOrderPermission } from '../model/order-authorization';
import { requireCustomerRead } from '../model/order-customer-reference';
import { repeatPreview } from '../model/repeat-preview';
import { repeatSource } from '../model/repeat-source';
import { scanReadableOrders } from '../model/order-scan';
import { decodeOrderCursor, orderFilterFingerprint } from '../model/order-search-cursor';
import type { OrderCursorContext } from '../model/order-search.types';
export function addRepeatRoutes(router: Router) {
  router.post(
    '/orders/:id/repeat-preview',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const id = idSchema.parse(req.params.id),
          body = orderRepeatPreviewSchema.parse(req.body);
        const source = await tx.order.findUnique({ where: { id } });
        assert(source, 404, 'Comanda nu există');
        requireOrderPermission(
          access,
          auth.user.id,
          source.locationId,
          'orders.read',
          source.total.toFixed(2),
        );
        assert(
          source.status !== 'DRAFT',
          409,
          'Repetați o comandă confirmată sau finalizată, nu o ciornă.',
        );
        assert(
          visibleLocations(access, auth.user.id).some(
            (location) => location.id === body.locationId,
          ),
        );
        requireOrderPermission(access, auth.user.id, body.locationId, 'orders.create');
        return repeatPreview(tx, access, auth.user.id, source, body.locationId);
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/customers/:customerId/last-order',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const customerId = idSchema.parse(req.params.customerId),
        query = orderLastCustomerOrderQuerySchema.parse(req.query);
      requireCustomerRead(access, auth.user.id, query.locationId);
      requireOrderPermission(access, auth.user.id, query.locationId, 'orders.read');
      assert(
        await tx.customer.findUnique({ where: { id: customerId } }),
        404,
        'Clientul nu există',
      );
      const context: OrderCursorContext = {
        organizationId: access.org.id,
        locationId: query.locationId,
        userId: auth.user.id,
        kind: 'CUSTOMER_LAST',
        fingerprint: orderFilterFingerprint({ customerId, status: 'COMPLETED' }),
      };
      const page = await scanReadableOrders(tx, access, {
        context,
        where: { locationId: query.locationId, customerId, status: 'COMPLETED' },
        limit: 1,
        ...(query.cursor ? { before: decodeOrderCursor(context, query.cursor) } : {}),
      });
      return {
        order: page.orders[0] ? repeatSource(page.orders[0]) : null,
        nextCursor: page.orders.length ? null : page.nextCursor,
      };
    }),
  );
}
