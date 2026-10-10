import { completePackingFixture } from './packing-complete.fixture';
import { consumeOrder } from '../../../../apps/api/src/entities/inventory';
import { checkoutData } from './checkout.fixture';
import type { InventoryFixture } from './inventory.types';
import type { sendInventoryOrder } from './inventory-send.fixture';

export async function readyInventoryOrder(
  state: InventoryFixture,
  sent: Pick<Awaited<ReturnType<typeof sendInventoryOrder>>, 'order' | 'ticket'>,
) {
  for (const status of ['PREPARING', 'READY']) {
    await state.txA(async (tx) => {
      await tx.kitchenTicket.update({
        where: { id: sent.ticket.id },
        data: { status, updatedByUserId: state.a.user.id, version: { increment: 1 } },
      });
      await tx.order.update({
        where: { id: sent.order.id },
        data: {
          status: 'IN_PROGRESS',
          kitchenStatus: status,
          version: { increment: 1 },
        },
      });
    });
  }
  return state.txA((tx) => completePackingFixture(tx, sent.order.id, state.a.user.id));
}

export async function finalizeInventoryOrder(
  state: InventoryFixture,
  sent: Pick<Awaited<ReturnType<typeof sendInventoryOrder>>, 'order'>,
  fail = false,
) {
  const order = await state.txA((tx) =>
    tx.order.findUniqueOrThrow({ where: { id: sent.order.id } }),
  );
  const data = await checkoutData(state, order);
  return state.txA(async (tx) => {
    await tx.checkout.create({ data });
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'COMPLETED', version: { increment: 1 } },
    });
    const document = await consumeOrder(tx, {
      organizationId: data.organizationId,
      locationId: data.locationId,
      orderId: order.id,
      requestKey: data.requestKey,
      requestHash: data.requestHash,
      actorUserId: data.createdByUserId,
      actorName: data.cashierName,
    });
    if (fail) throw new Error('Rollback sintetic după consum');
    return document;
  });
}
