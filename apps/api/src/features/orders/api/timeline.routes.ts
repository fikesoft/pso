import { idSchema } from '@pos/contracts';
import type { Router } from 'express';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireOrderPermission } from '../model/order-authorization';
import { readTimeline } from '../model/read-timeline';
import { timelineQuerySchema } from '../model/timeline-cursor';

export function addTimelineRoute(router: Router) {
  router.get(
    '/orders/:id/timeline',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const orderId = idSchema.parse(req.params.id);
      const { cursor } = timelineQuerySchema.parse(req.query);
      const order = await tx.order.findUnique({ where: { id: orderId } });
      assert(order, 404, 'Comanda nu există');
      requireOrderPermission(
        access,
        auth.user.id,
        order.locationId,
        'orders.read',
        order.total.toFixed(2),
      );
      return readTimeline(
        tx,
        { organizationId: access.org.id, locationId: order.locationId, orderId },
        cursor,
      );
    }),
  );
}
