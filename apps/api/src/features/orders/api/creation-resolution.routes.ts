import { requireOrderVisitAccess } from '../model/order-table-visit';
import { requireLinkedCustomerAccess } from '../model/order-customer-reference';
import { orderCreationResolutionSchema } from '@pos/contracts';
import type { Router } from 'express';
import { orderResponse } from '../../../entities/order';
import { audit, endpoint } from '../../../entities/tenant-access';
import { canReadOrder, requireOrderPermission } from '../model/order-authorization';
import { validateOrderCreationHeader } from '../model/order-creation-key';

export function addCreationResolutionRoute(router: Router) {
  router.post(
    '/orders/creation-resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = orderCreationResolutionSchema.parse(req.body);
      validateOrderCreationHeader(req.headers['idempotency-key'], body.requestKey);
      requireOrderPermission(access, auth.user.id, body.locationId, 'orders.create');
      const order = await tx.order.findFirst({
        where: { locationId: body.locationId, clientRequestId: body.requestKey },
      });
      if (order) {
        requireOrderVisitAccess(access, auth.user.id, order);
        requireLinkedCustomerAccess(access, auth.user.id, order);
        requireOrderPermission(
          access,
          auth.user.id,
          order.locationId,
          'orders.create',
          order.total.toFixed(2),
        );
        return {
          status: 'CREATED',
          order: await orderResponse(tx, order, canReadOrder(access, auth.user.id, order)),
        };
      }
      const retired = await tx.orderCreationClaim.findFirst({
        where: { locationId: body.locationId, requestKey: body.requestKey, status: 'RETIRED' },
      });
      if (!retired) {
        const claim = await tx.orderCreationClaim.create({
          data: {
            organizationId: access.org.id,
            locationId: body.locationId,
            requestKey: body.requestKey,
            status: 'RETIRED',
            actorUserId: auth.user.id,
          },
        });
        await audit(
          tx,
          auth,
          req,
          'orders.creation.retired',
          'ORDER_CREATION_CLAIM',
          claim.id,
          body.locationId,
        );
      }
      return { status: 'RETIRED', locationId: body.locationId, requestKey: body.requestKey };
    }),
  );
}
