import { completeOrderSchema, idSchema } from '@pos/contracts';
import type { Router } from 'express';
import { consumeOrder } from '../../../entities/inventory';
import { effectiveOrderStatus, orderResponse } from '../../../entities/order';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { requireOrderPermission } from '../model/order-authorization';

export function addCompletionRoute(router: Router) {
  router.post(
    '/orders/:id/complete',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const body = completeOrderSchema.parse(req.body);
      const current = await tx.order.findUnique({ where: { id } });
      assert(current, 404, 'Comanda nu există');
      requireOrderPermission(
        access,
        auth.user.id,
        current.locationId,
        'orders.complete',
        current.total.toFixed(2),
      );
      const hash = requestHash({ orderId: id, action: 'COMPLETE', ...body });
      const previous = await tx.orderStatusEvent.findFirst({
        where: { locationId: current.locationId, requestKey: body.requestKey },
      });
      if (previous) {
        assert(
          previous.orderId === id && previous.requestHash === hash,
          409,
          'Cheia cererii a fost folosită pentru alte date',
        );
        return { order: await orderResponse(tx, current) };
      }
      assert(
        effectiveOrderStatus(current.status, current.kitchenStatus) === 'READY',
        409,
        'Comanda trebuie să fie preparată și verificată înainte de finalizare',
      );
      assert(current.version === body.version, 409, 'Comanda a fost modificată. Reîncărcați.');
      const order = await tx.order.update({
        where: { id },
        data: { status: 'COMPLETED', version: { increment: 1 }, updatedByUserId: auth.user.id },
      });
      await tx.orderStatusEvent.create({
        data: {
          organizationId: access.org.id,
          locationId: order.locationId,
          orderId: id,
          kind: 'ORDER',
          fromStatus: 'READY',
          toStatus: 'COMPLETED',
          actorUserId: auth.user.id,
          requestKey: body.requestKey,
          requestHash: hash,
          orderVersion: order.version,
        },
      });
      const consumption = await consumeOrder(tx, {
        organizationId: access.org.id,
        locationId: order.locationId,
        orderId: id,
        requestKey: body.requestKey,
        requestHash: hash,
        actorUserId: auth.user.id,
        actorName: access.currentUser.displayName,
      });
      if (consumption)
        await audit(
          tx,
          auth,
          req,
          'inventory.consumption',
          'INVENTORY_DOCUMENT',
          consumption.id,
          order.locationId,
        );
      await audit(tx, auth, req, 'orders.completed', 'ORDER', id, order.locationId);
      return { order: await orderResponse(tx, order) };
    }),
  );
}
