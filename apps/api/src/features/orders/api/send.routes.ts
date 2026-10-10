import { idSchema, sendOrderSchema } from '@pos/contracts';
import type { Router } from 'express';
import { orderResponse, ticketResponse, generateKitchenTicket } from '../../../entities/order';
import { reserveOrder } from '../../../entities/inventory';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireOrderPermission } from '../model/order-authorization';
import { requestHash } from '../../../shared/lib/idempotency';
import { requireSendAvailability } from '../model/send-availability';
import { requireDeliveryFee } from '../model/require-delivery-fee';

export function addSendRoutes(router: Router) {
  router.post(
    '/orders/:id/send',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const body = sendOrderSchema.parse(req.body);
      const current = await tx.order.findUnique({ where: { id } });
      assert(current, 404, 'Comanda nu există');
      requireOrderPermission(
        access,
        auth.user.id,
        current.locationId,
        'orders.create',
        String(current.total),
      );
      const hash = requestHash({ orderId: id, ...body });
      const previous = await tx.kitchenTicket.findFirst({
        where: { requestKey: body.requestKey, locationId: current.locationId },
      });
      if (previous) {
        assert(
          previous.orderId === id && previous.requestHash === hash,
          409,
          'Cheia cererii a fost folosită pentru alte date',
        );
        return {
          order: await orderResponse(tx, current),
          ticket: await ticketResponse(tx, previous),
        };
      }
      assert(
        (current.status === 'DRAFT' || current.status === 'CONFIRMED') &&
          current.kitchenStatus === 'NOT_SENT',
        409,
        'Comanda a fost deja trimisă sau anulată',
      );
      assert(current.version === body.version, 409, 'Comanda a fost modificată. Reîncărcați.');
      await requireDeliveryFee(tx, current);
      const items = await tx.orderItem.findMany({
        where: { orderId: id },
        orderBy: { position: 'asc' },
      });
      assert(items.length, 409, 'Comanda nu conține produse');
      await requireSendAvailability(tx, current.locationId, items);
      const ticket = await generateKitchenTicket(
        tx,
        {
          organizationId: access.org.id,
          locationId: current.locationId,
          orderId: id,
          orderVersion: current.version + 1,
          requestKey: body.requestKey,
          requestHash: hash,
          actorUserId: auth.user.id,
        },
        items,
      );
      const order = await tx.order.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          kitchenStatus: 'QUEUED',
          version: { increment: 1 },
          updatedByUserId: auth.user.id,
        },
      });
      const reservation = await reserveOrder(tx, {
        organizationId: access.org.id,
        locationId: order.locationId,
        orderId: order.id,
        serviceType: order.serviceType,
        requestKey: body.requestKey,
        requestHash: hash,
        actorUserId: auth.user.id,
        actorName: access.currentUser.displayName,
        items: items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity.toFixed(3),
        })),
      });
      await audit(
        tx,
        auth,
        req,
        'inventory.reserved',
        'INVENTORY_RESERVATION',
        reservation.id,
        order.locationId,
      );
      await tx.orderStatusEvent.createMany({
        data: [
          ...(current.status === 'DRAFT'
            ? [
                {
                  organizationId: access.org.id,
                  locationId: current.locationId,
                  orderId: id,
                  kind: 'ORDER',
                  fromStatus: 'DRAFT',
                  toStatus: 'CONFIRMED',
                  actorUserId: auth.user.id,
                },
              ]
            : []),
          {
            organizationId: access.org.id,
            locationId: current.locationId,
            orderId: id,
            kind: 'KITCHEN',
            fromStatus: 'NOT_SENT',
            toStatus: 'QUEUED',
            actorUserId: auth.user.id,
          },
        ],
      });
      await audit(tx, auth, req, 'orders.sent', 'ORDER', id, current.locationId);
      return { order: await orderResponse(tx, order), ticket: await ticketResponse(tx, ticket) };
    }),
  );
}
