import { Router } from 'express';
import { addCourierAcceptanceRoutes } from './acceptance.routes';
import { courierWorkQuerySchema, courierWorkDetailQuerySchema, idSchema } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { courierWorkList } from '../model/courier-work-list';
import { courierWorkView } from '../model/courier-work-view';
import { canReadCourierWork, requireCourierWork } from '../model/courier-work-access';
export function courierWorkRouter() {
  const router = Router();
  addCourierAcceptanceRoutes(router);
  router.get(
    '/courier-work',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        return courierWorkList(tx, access, auth.user.id, courierWorkQuerySchema.parse(req.query));
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/courier-work/:id',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const { locationId } = courierWorkDetailQuerySchema.parse(req.query);
        await requireCourierWork(tx, access, auth.user.id, locationId);
        const order = await tx.order.findFirst({
          where: {
            id: idSchema.parse(req.params.id),
            organizationId: access.org.id,
            locationId,
            deliveryCourierId: auth.user.id,
            serviceType: 'DELIVERY',
            deliveryStatus: { in: ['ASSIGNED', 'PICKED_UP', 'DELIVERING', 'DELIVERED', 'FAILED'] },
          },
        });
        assert(order, 404, 'Livrarea nu există.');
        assert(canReadCourierWork(access, auth.user.id, locationId, order.total.toFixed(2)));
        return { order: await courierWorkView(tx, order) };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  return router;
}
