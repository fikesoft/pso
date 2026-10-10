import { Router } from 'express';
import { deliveryResolutionSchema, deliveryResolutionResponseSchema } from '@pos/contracts';
import { resolveDelivery } from '../model/delivery-recovery';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { deliveryCommandSchema, deliveryQuerySchema, idSchema } from '@pos/contracts';
import { endpoint, audit } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { DELIVERY_PAGE_SIZE } from '../config/delivery.constants';
import { deliveryAccess } from '../model/delivery-access';
import { deliveryOperationResponse } from '../model/operation-response';
import { executeDelivery } from '../model/execute-delivery';
import { courierProfileAllowsAssignment } from '../../../entities/courier';

export function deliveryRouter() {
  const router = Router();
  router.post(
    '/orders/:id/delivery/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = deliveryResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const { result, retired } = await resolveDelivery(
        tx,
        access,
        auth.user.id,
        idSchema.parse(req.params.id),
        body,
      );
      if (retired)
        await audit(
          tx,
          auth,
          req,
          'delivery.request.retired',
          'DELIVERY_RETIREMENT',
          retired.id,
          body.locationId,
        );
      return deliveryResolutionResponseSchema.parse(result);
    }),
  );
  router.post(
    '/orders/:id/delivery',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = deliveryCommandSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      return executeDelivery(tx, access, auth, req, idSchema.parse(req.params.id), body);
    }),
  );
  router.get(
    '/orders/:id/delivery',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const orderId = idSchema.parse(req.params.id);
      const { cursor } = deliveryQuerySchema.parse(req.query);
      const order = await tx.order.findUnique({ where: { id: orderId } });
      assert(order, 404, 'Comanda nu există');
      const rights = deliveryAccess(access, auth.user.id, order);
      if (cursor)
        assert(
          await tx.deliveryOperation.findFirst({ where: { id: cursor, orderId } }),
          400,
          'Cursorul nu aparține comenzii',
        );
      const stored = await tx.deliveryOperation.findMany({
        where: { orderId },
        take: DELIVERY_PAGE_SIZE + 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const page = stored.slice(0, DELIVERY_PAGE_SIZE);
      return {
        operations: page.map(deliveryOperationResponse),
        nextCursor: stored.length > DELIVERY_PAGE_SIZE ? page.at(-1)!.id : null,
        canAssign: rights.canAssign,
        canUpdate: rights.canUpdate,
      };
    }),
  );
  router.get(
    '/orders/:id/delivery-couriers',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const order = await tx.order.findUnique({ where: { id: idSchema.parse(req.params.id) } });
      assert(order, 404, 'Comanda nu există');
      const rights = deliveryAccess(access, auth.user.id, order);
      assert(rights.canAssign);
      const { cursor } = deliveryQuerySchema.parse(req.query);
      const users = access.users
        .filter((user) => user.status === 'ACTIVE' && rights.eligible(user.id))
        .sort((a, b) => a.id.localeCompare(b.id));
      const availability = await Promise.all(
        users.map((user) =>
          courierProfileAllowsAssignment(tx, access.org.id, order.locationId, user.id),
        ),
      );
      const eligible = users.filter((_user, index) => availability[index]);
      const start = cursor ? eligible.findIndex((user) => user.id === cursor) + 1 : 0;
      assert(!cursor || start > 0, 400, 'Cursorul nu mai este disponibil. Reîncărcați.');
      const page = eligible.slice(start, start + DELIVERY_PAGE_SIZE);
      return {
        couriers: page.map(({ id, displayName }) => ({ id, displayName })),
        nextCursor: start + page.length < eligible.length ? page.at(-1)!.id : null,
      };
    }),
  );
  return router;
}
