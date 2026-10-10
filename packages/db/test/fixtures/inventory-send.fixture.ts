import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '../../src/index';
import type { InventoryFixture, InventorySendOptions } from './inventory.types';

export async function sendInventoryOrder(
  state: InventoryFixture,
  options: InventorySendOptions = {},
) {
  const draft = await state.createDraft();
  const quantity = new Prisma.Decimal(options.quantity ?? '1.125');
  const lineTotal = quantity
    .mul(draft.item.unitPrice)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return state.txA(async (tx) => {
    const line = await tx.orderItem.update({
      where: { id: draft.item.id },
      data: { quantity, lineTotal },
    });
    const order = await tx.order.update({
      where: { id: draft.order.id },
      data: {
        total: lineTotal,
        serviceType: options.serviceType ?? 'TAKEAWAY',
        version: { increment: 1 },
      },
    });
    const ticket = await tx.kitchenTicket.create({
      data: {
        organizationId: state.a.organization.id,
        locationId: order.locationId,
        orderId: order.id,
        orderVersion: order.version + 1,
        requestKey: randomUUID(),
        requestHash: createHash('sha256').update(randomUUID()).digest('hex'),
        sentByUserId: state.a.user.id,
      },
    });
    await tx.kitchenTicketItem.create({
      data: {
        organizationId: state.a.organization.id,
        locationId: order.locationId,
        ticketId: ticket.id,
        orderItemId: line.id,
        position: line.position,
        productName: line.productName,
        productSku: line.productSku,
        quantity: line.quantity,
        note: line.note,
      },
    });
    const sentOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CONFIRMED',
        kitchenStatus: 'QUEUED',
        version: { increment: 1 },
      },
    });
    const reservation = await tx.inventoryReservation.create({
      data: {
        organizationId: state.a.organization.id,
        locationId: order.locationId,
        orderId: order.id,
        createdByUserId: state.a.user.id,
      },
    });
    const recipe = await tx.recipeVersion.findFirst({
      where: { productId: line.productId },
      orderBy: { version: 'desc' },
    });
    const components = recipe
      ? await tx.recipeComponent.findMany({
          where: { recipeVersionId: recipe.id, serviceTypes: { has: order.serviceType } },
        })
      : [];
    const movements = [];
    if (!options.omitMovements) {
      for (const component of components) {
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: component.inventoryItemId },
        });
        movements.push(
          await tx.inventoryReservationLine.create({
            data: {
              organizationId: state.a.organization.id,
              locationId: order.locationId,
              reservationId: reservation.id,
              inventoryItemId: item.id,
              itemName: item.name,
              itemSku: item.sku,
              unit: item.unit,
              quantity: line.quantity.mul(component.quantityPerUnit),
              orderItemId: line.id,
              recipeComponentId: component.id,
              productName: line.productName,
              ...options.movement,
            },
          }),
        );
      }
    }
    return { order: sentOrder, ticket, reservation, movements };
  });
}
