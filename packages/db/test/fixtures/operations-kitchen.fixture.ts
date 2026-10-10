import { reserveOrder } from '../../../../apps/api/src/entities/inventory';
import { createHash, randomUUID } from 'node:crypto';
import type { KitchenFixtureOptions, OperationsDraft, OperationsFixture } from './operations.types';

export async function publishKitchenFixture(
  state: OperationsFixture,
  draft: OperationsDraft,
  options: KitchenFixtureOptions = {},
) {
  return state.txA(async (tx) => {
    const ticket = await tx.kitchenTicket.create({
      data: {
        organizationId: state.a.organization.id,
        locationId: options.locationId ?? draft.order.locationId,
        orderId: draft.order.id,
        orderVersion: draft.order.version + 1,
        requestKey: randomUUID(),
        requestHash: createHash('sha256').update(randomUUID()).digest('hex'),
        sentByUserId: state.a.user.id,
      },
    });
    const item = options.omitItems
      ? null
      : await tx.kitchenTicketItem.create({
          data: {
            organizationId: state.a.organization.id,
            locationId: draft.order.locationId,
            ticketId: ticket.id,
            orderItemId: options.orderItemId ?? draft.item.id,
            position: draft.item.position,
            productName: options.productName ?? draft.item.productName,
            productSku: draft.item.productSku,
            quantity: draft.item.quantity,
            note: draft.item.note,
            ...options.alertIdentity,
          },
        });
    if (!options.leaveDraft) {
      const order = await tx.order.update({
        where: { id: draft.order.id },
        data: { status: 'CONFIRMED', kitchenStatus: 'QUEUED', version: { increment: 1 } },
      });
      if (!options.omitReservation) {
        const actor = await tx.companyUser.findUniqueOrThrow({ where: { id: state.a.user.id } });
        await reserveOrder(tx, {
          organizationId: state.a.organization.id,
          locationId: order.locationId,
          orderId: order.id,
          serviceType: order.serviceType,
          requestKey: ticket.requestKey,
          requestHash: ticket.requestHash,
          actorUserId: actor.id,
          actorName: actor.displayName,
          items: [
            {
              id: draft.item.id,
              productId: draft.item.productId,
              productName: draft.item.productName,
              quantity: draft.item.quantity.toFixed(3),
            },
          ],
        });
      }
      await options.afterSend?.(tx);
    }
    return { ticket, item };
  });
}
