import {
  createOrderVisit,
  preserveOrderVisit,
  requireOrderVisitAccess,
} from '../model/order-table-visit';
import { orderDraftContact } from '../model/order-draft-contact';
import { draftDeliveryFee } from '../model/draft-delivery-fee';
import { randomUUID } from 'node:crypto';
import { createOrderSchema, idSchema, updateOrderSchema } from '@pos/contracts';
import type { Router } from 'express';
import { orderResponse, prepareOrderItems, replaceDraftItems } from '../../../entities/order';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { canReadOrder, requireOrderPermission } from '../model/order-authorization';
import { orderModifierQuotes } from '../model/modifier-quotes';
import { requireScheduleAvailability } from '../../../entities/menu-schedule';
import { orderCreationHash } from '../model/order-creation-hash';
import {
  requireCustomerRead,
  requireLinkedCustomerAccess,
} from '../model/order-customer-reference';
import { validateOrderUpsellOffers } from '../../../entities/upsell';
import { requireOpenCreationKey, validateOrderCreationHeader } from '../model/order-creation-key';

export function addDraftRoutes(router: Router) {
  router.post(
    '/orders',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = createOrderSchema.parse(req.body);
      validateOrderCreationHeader(req.headers['idempotency-key'], body.requestKey);
      requireOrderPermission(access, auth.user.id, body.locationId, 'orders.create');
      const hash = orderCreationHash(access.org.id, body);
      const previous = await tx.order.findFirst({
        where: { clientRequestId: body.requestKey, locationId: body.locationId },
      });
      if (previous) {
        requireOrderVisitAccess(access, auth.user.id, previous);
        if (body.customerRef || body.addressRef)
          requireCustomerRead(access, auth.user.id, body.locationId);
        requireLinkedCustomerAccess(access, auth.user.id, previous);
        assert(
          previous.creationRequestHash === hash,
          409,
          'Cheia cererii a fost folosită pentru alte date',
        );
        requireOrderPermission(
          access,
          auth.user.id,
          previous.locationId,
          'orders.create',
          String(previous.total),
        );
        return {
          order: await orderResponse(tx, previous, canReadOrder(access, auth.user.id, previous)),
        };
      }
      await requireOpenCreationKey(tx, body.locationId, body.requestKey);
      await requireScheduleAvailability(
        tx,
        body.locationId,
        body.items.map((item) => item.productId),
      );
      const quotes = await orderModifierQuotes(tx, body.items);
      const offers = await validateOrderUpsellOffers(tx, body.locationId, auth.user.id, body.items);
      const prepared = await prepareOrderItems(tx, body.locationId, body.items, quotes, [], offers);
      requireOrderPermission(
        access,
        auth.user.id,
        body.locationId,
        'orders.create',
        prepared.total,
      );
      const latest = await tx.order.aggregate({
        where: { locationId: body.locationId },
        _max: { number: true },
      });
      const linkedVisit = await createOrderVisit(tx, access, auth.user.id, body);
      const orderId = randomUUID();
      const order = await tx.order.create({
        data: {
          id: orderId,
          organizationId: access.org.id,
          locationId: body.locationId,
          ...(await orderDraftContact(
            tx,
            access,
            auth.user.id,
            { id: orderId, organizationId: access.org.id, locationId: body.locationId },
            body,
          )),
          source: body.source,
          number: (latest._max.number ?? 0) + 1,
          serviceType: body.serviceType,
          tableLabel: body.tableLabel ?? null,
          ...linkedVisit,
          notes: body.notes ?? null,
          total: prepared.total,
          clientRequestId: body.requestKey,
          creationRequestHash: hash,
          createdByUserId: auth.user.id,
          updatedByUserId: auth.user.id,
        },
      });
      await replaceDraftItems(tx, order.id, access.org.id, order.locationId, prepared.items);
      await tx.orderStatusEvent.create({
        data: {
          organizationId: access.org.id,
          locationId: order.locationId,
          orderId: order.id,
          kind: 'ORDER',
          toStatus: 'DRAFT',
          actorUserId: auth.user.id,
        },
      });
      await audit(tx, auth, req, 'orders.created', 'ORDER', order.id, order.locationId);
      return { order: await orderResponse(tx, order, canReadOrder(access, auth.user.id, order)) };
    }),
  );
  router.patch(
    '/orders/:id',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const body = updateOrderSchema.parse(req.body);
      const current = await tx.order.findUnique({ where: { id } });
      assert(current, 404, 'Comanda nu există');
      requireOrderPermission(
        access,
        auth.user.id,
        current.locationId,
        'orders.create',
        String(current.total),
      );
      requireOrderVisitAccess(access, auth.user.id, current);
      const tableLabel = preserveOrderVisit(current, body);
      assert(current.status === 'DRAFT', 409, 'Se poate modifica numai o ciornă netrimisă');
      assert(current.version === body.version, 409, 'Comanda a fost modificată. Reîncărcați.');
      const oldItems = await tx.orderItem.findMany({ where: { orderId: id } });
      await requireScheduleAvailability(
        tx,
        current.locationId,
        body.items.filter((item) => !item.id).map((item) => item.productId),
      );
      const quotes = await orderModifierQuotes(tx, body.items);
      const offers = await validateOrderUpsellOffers(
        tx,
        current.locationId,
        auth.user.id,
        body.items,
      );
      const prepared = await prepareOrderItems(
        tx,
        current.locationId,
        body.items,
        quotes,
        oldItems,
        offers,
      );
      const contact = await orderDraftContact(tx, access, auth.user.id, current, body);
      const financial = draftDeliveryFee(
        current,
        body.serviceType,
        'deliveryAddressHash' in contact ? contact.deliveryAddressHash : undefined,
        prepared.total,
      );
      requireOrderPermission(
        access,
        auth.user.id,
        current.locationId,
        'orders.create',
        financial.total,
      );
      await replaceDraftItems(tx, id, access.org.id, current.locationId, prepared.items);
      const order = await tx.order.update({
        where: { id },
        data: {
          serviceType: body.serviceType,
          tableLabel,
          notes: body.notes ?? null,
          ...contact,
          ...financial,
          updatedByUserId: auth.user.id,
          version: { increment: 1 },
        },
      });
      await audit(tx, auth, req, 'orders.draft.updated', 'ORDER', id, order.locationId, {
        editedFields: [
          'items',
          ...(current.customerId !== order.customerId ? ['customerRef'] : []),
          ...(current.deliveryAddressEncrypted !== order.deliveryAddressEncrypted
            ? ['deliveryAddress']
            : []),
          ...(current.customerAddressId !== order.customerAddressId ? ['addressRef'] : []),
          ...(current.customerDataEncrypted !== order.customerDataEncrypted ? ['customer'] : []),
          ...(current.serviceType !== order.serviceType ? ['serviceType'] : []),
          ...(current.tableLabel !== order.tableLabel ? ['tableLabel'] : []),
          ...(current.notes !== order.notes ? ['notes'] : []),
          ...(!current.total.equals(order.total) ? ['total'] : []),
        ],
      });
      return { order: await orderResponse(tx, order, canReadOrder(access, auth.user.id, order)) };
    }),
  );
}
