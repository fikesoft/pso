import { cancelOrderSchema, confirmOrderSchema, idSchema } from '@pos/contracts';
import type { Router } from 'express';
import {
  effectiveKitchenStatus,
  effectiveOrderStatus,
  orderResponse,
  paymentSummary,
} from '../../../entities/order';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { requireOrderPermission } from '../model/order-authorization';
import { requireSendAvailability } from '../model/send-availability';
import { requireDeliveryFee } from '../model/require-delivery-fee';

export function addLifecycleRoutes(router: Router) {
  router.post(
    '/orders/:id/confirm',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const body = confirmOrderSchema.parse(req.body);
      const current = await tx.order.findUnique({ where: { id } });
      assert(current, 404, 'Comanda nu există');
      requireOrderPermission(
        access,
        auth.user.id,
        current.locationId,
        'orders.create',
        String(current.total),
      );
      const hash = requestHash({ orderId: id, action: 'CONFIRM', ...body });
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
      assert(current.status === 'DRAFT', 409, 'Se poate confirma numai o ciornă');
      await requireDeliveryFee(tx, current);
      assert(current.version === body.version, 409, 'Comanda a fost modificată. Reîncărcați.');
      const items = await tx.orderItem.findMany({ where: { orderId: id } });
      assert(items.length, 409, 'Comanda nu conține produse');
      await requireSendAvailability(tx, current.locationId, items);
      const order = await tx.order.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          version: { increment: 1 },
          updatedByUserId: auth.user.id,
        },
      });
      await tx.orderStatusEvent.create({
        data: {
          organizationId: access.org.id,
          locationId: order.locationId,
          orderId: id,
          kind: 'ORDER',
          fromStatus: 'DRAFT',
          toStatus: 'CONFIRMED',
          actorUserId: auth.user.id,
          requestKey: body.requestKey,
          requestHash: hash,
        },
      });
      await audit(tx, auth, req, 'orders.confirmed', 'ORDER', id, order.locationId);
      return { order: await orderResponse(tx, order) };
    }),
  );
  router.post(
    '/orders/:id/cancel',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const body = cancelOrderSchema.parse(req.body);
      const current = await tx.order.findUnique({ where: { id } });
      assert(current, 404, 'Comanda nu există');
      const hash = requestHash({ orderId: id, action: 'CANCEL', ...body });
      const previous = body.requestKey
        ? await tx.orderStatusEvent.findFirst({
            where: { locationId: current.locationId, requestKey: body.requestKey },
          })
        : null;
      const originalDraft =
        previous?.orderId === id &&
        previous.requestHash === hash &&
        previous.fromStatus === 'DRAFT';
      const cancelledDraft =
        current.status === 'CANCELLED' &&
        (await tx.orderStatusEvent.findFirst({
          where: { orderId: id, kind: 'ORDER', fromStatus: 'DRAFT', toStatus: 'CANCELLED' },
        }));
      requireOrderPermission(
        access,
        auth.user.id,
        current.locationId,
        current.status === 'DRAFT' || originalDraft || cancelledDraft
          ? 'orders.create'
          : 'orders.cancel',
        String(current.total),
      );
      if (previous) {
        assert(
          previous.orderId === id && previous.requestHash === hash,
          409,
          'Cheia cererii a fost folosită pentru alte date',
        );
        return { order: await orderResponse(tx, current) };
      }
      assert(
        !(await tx.billSplitSource.findFirst({ where: { orderId: id, isActive: true } })),
        409,
        'Anulați împărțirea notei înainte de anularea comenzii.',
      );
      const state = effectiveOrderStatus(current.status, current.kitchenStatus);
      assert(state !== 'COMPLETED' && state !== 'CANCELLED', 409, 'Comanda este deja închisă');
      assert(current.version === body.version, 409, 'Comanda a fost modificată. Reîncărcați.');
      assert(
        !['ASSIGNED', 'PICKED_UP', 'DELIVERING', 'DELIVERED'].includes(
          current.deliveryStatus ?? '',
        ),
        409,
        'Rezolvați livrarea activă înainte de anularea comenzii',
      );
      assert(
        state === 'DRAFT' || body.reason,
        400,
        'Motivul anulării este obligatoriu pentru o comandă confirmată',
      );
      const [consumption, financial] = await Promise.all([
        tx.inventoryDocument.findFirst({ where: { orderId: id, kind: 'CONSUMPTION' } }),
        paymentSummary(tx, id),
      ]);
      assert(
        !consumption && financial.netPaidAmount === '0.00',
        409,
        'Comanda are consum sau plată înregistrată și necesită reconciliere înainte de anulare',
      );
      const ticket = await tx.kitchenTicket.findFirst({ where: { orderId: id } });
      if (ticket) {
        await tx.kitchenTicket.update({
          where: { id: ticket.id },
          data: {
            status: 'CANCELLED',
            version: { increment: 1 },
            updatedByUserId: auth.user.id,
          },
        });
      }
      const order = await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          kitchenStatus: effectiveKitchenStatus(current.kitchenStatus),
          version: { increment: 1 },
          updatedByUserId: auth.user.id,
        },
      });
      if (ticket)
        await tx.orderStatusEvent.create({
          data: {
            organizationId: access.org.id,
            locationId: current.locationId,
            orderId: id,
            kind: 'KITCHEN',
            fromStatus: effectiveKitchenStatus(ticket.status),
            toStatus: 'CANCELLED',
            actorUserId: auth.user.id,
            reason: body.reason,
          },
        });
      const reservation = await tx.inventoryReservation.findFirst({ where: { orderId: id } });
      if (reservation) {
        assert(reservation.status === 'PENDING', 409, 'Rezervarea a fost deja rezolvată');
        await tx.inventoryReservation.update({
          where: { id: reservation.id },
          data: { status: 'RELEASED', resolvedAt: new Date() },
        });
        await audit(
          tx,
          auth,
          req,
          'inventory.released',
          'INVENTORY_RESERVATION',
          reservation.id,
          current.locationId,
        );
      }
      await tx.orderStatusEvent.create({
        data: {
          organizationId: access.org.id,
          locationId: current.locationId,
          orderId: id,
          kind: 'ORDER',
          fromStatus: state,
          toStatus: 'CANCELLED',
          actorUserId: auth.user.id,
          reason: body.reason,
          ...(body.requestKey ? { requestKey: body.requestKey, requestHash: hash } : {}),
        },
      });
      await audit(tx, auth, req, 'orders.cancelled', 'ORDER', id, current.locationId);
      return { order: await orderResponse(tx, order) };
    }),
  );
}
