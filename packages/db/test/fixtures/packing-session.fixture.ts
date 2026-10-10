import { randomUUID } from 'node:crypto';
import type { ServiceType } from '../../../contracts/src';
import { generateKitchenTicket } from '../../../../apps/api/src/entities/order';
import { reserveOrder } from '../../../../apps/api/src/entities/inventory';
import { createOperationsFixture } from './operations.fixture';

export async function createPackingSessionFixture(serviceType: ServiceType = 'DINE_IN') {
  const f = await createOperationsFixture();
  try {
    const draft = await f.createDraft();
    const ticket = await f.txA(async (tx) => {
      const order = await tx.order.update({
        where: { id: draft.order.id },
        data: {
          serviceType,
          tableLabel: serviceType === 'DINE_IN' ? 'Masa sintetică 1' : null,
          deliveryStatus: serviceType === 'DELIVERY' ? 'WAITING_COURIER' : 'NOT_REQUIRED',
          version: 2,
        },
      });
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
      const requestKey = randomUUID();
      const requestHash = 'c'.repeat(64);
      const ticket = await generateKitchenTicket(
        tx,
        {
          organizationId: f.a.organization.id,
          locationId: f.locationA.id,
          orderId: order.id,
          orderVersion: 3,
          requestKey,
          requestHash,
          actorUserId: f.a.user.id,
        },
        items,
      );
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CONFIRMED', kitchenStatus: 'QUEUED', version: 3 },
      });
      await reserveOrder(tx, {
        organizationId: f.a.organization.id,
        locationId: f.locationA.id,
        orderId: order.id,
        requestKey,
        requestHash,
        actorUserId: f.a.user.id,
        actorName: 'Sintetic',
        serviceType,
        items: items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity.toFixed(3),
        })),
      });
      return ticket;
    });
    const session = await f.txA((tx) => tx.packingSession.findFirstOrThrow());
    const items = await f.txA((tx) => tx.packingItem.findMany());
    return { ...f, ticket, session, items };
  } catch (failure) {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
    throw failure;
  }
}
