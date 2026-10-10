import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '../../src';
import { createOperationsFixture } from './operations.fixture';
import { createStation, stationData } from './kitchen-station.fixture';
import { generateKitchenTicket } from '../../../../apps/api/src/entities/order';
import { reserveOrder } from '../../../../apps/api/src/entities/inventory';
export async function createKitchenBatchesFixture() {
  const f = await createOperationsFixture();
  const station = await f.txA((tx) => createStation(tx, stationData(f)));
  await f.txA((tx) =>
    tx.kitchenRoutingCommand.create({
      data: {
        organizationId: f.a.organization.id,
        locationId: f.locationA.id,
        productId: f.catalogA.product.id,
        actorUserId: f.a.user.id,
        requestKey: randomUUID(),
        status: 'SUCCEEDED',
        requestHash: 'a'.repeat(64),
        expectedVersion: 0,
        resultVersion: 1,
        stationId: station.id,
      },
    }),
  );
  const draft = await f.createDraft();
  const ticket = await f.txA(async (tx) => {
    const product = await tx.product.create({
      data: {
        organizationId: f.a.organization.id,
        categoryId: f.catalogA.category.id,
        name: 'Produs neatribuit',
        sku: 'UNASSIGNED',
        createdByUserId: f.a.user.id,
      },
    });
    await tx.locationProduct.create({
      data: {
        organizationId: f.a.organization.id,
        locationId: f.locationA.id,
        productId: product.id,
        price: '10.0050',
      },
    });
    await tx.orderItem.create({
      data: {
        organizationId: f.a.organization.id,
        locationId: f.locationA.id,
        orderId: draft.order.id,
        productId: product.id,
        position: 1,
        productName: product.name,
        productSku: product.sku,
        unitPrice: '10.0050',
        quantity: '1',
        lineTotal: '10.01',
      },
    });
    await tx.order.update({ where: { id: draft.order.id }, data: { total: '20.02', version: 2 } });
    const items = await tx.orderItem.findMany({
      where: { orderId: draft.order.id },
      orderBy: { position: 'asc' },
    });
    const key = randomUUID();
    const sent = await generateKitchenTicket(
      tx,
      {
        organizationId: f.a.organization.id,
        locationId: f.locationA.id,
        orderId: draft.order.id,
        orderVersion: 3,
        requestKey: key,
        requestHash: 'b'.repeat(64),
        actorUserId: f.a.user.id,
      },
      items,
    );
    await tx.order.update({
      where: { id: draft.order.id },
      data: { status: 'CONFIRMED', kitchenStatus: 'QUEUED', version: 3 },
    });
    await reserveOrder(tx, {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      orderId: draft.order.id,
      requestKey: key,
      requestHash: 'b'.repeat(64),
      actorUserId: f.a.user.id,
      actorName: 'Sintetic',
      serviceType: 'DINE_IN',
      items: items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity.toFixed(3),
      })),
    });
    return sent;
  });
  const batches = await f.txA((tx) =>
    tx.kitchenTicketBatch.findMany({ where: { ticketId: ticket.id } }),
  );
  return {
    ...f,
    station,
    ticket,
    assigned: batches.find((batch) => batch.stationId !== null)!,
    unassigned: batches.find((batch) => batch.stationId === null)!,
  };
}

export async function advanceKitchenBatch(
  tx: TenantTransaction,
  batchId: string,
  actor: string,
  status: string,
) {
  const batch = await tx.kitchenTicketBatch.update({
    where: { id: batchId },
    data: { status, version: { increment: 1 }, updatedByUserId: actor },
  });
  const [next] = await tx.$queryRaw<
    Array<{ status: string }>
  >`SELECT public.kitchen_batch_status(${batch.organizationId}::uuid,${batch.ticketId}::uuid) AS status`;
  const ticket = await tx.kitchenTicket.update({
    where: { id: batch.ticketId },
    data: { status: next!.status, version: { increment: 1 }, updatedByUserId: actor },
  });
  const order = await tx.order.findUniqueOrThrow({ where: { id: ticket.orderId } });
  const packing = await tx.packingSession.findFirst({ where: { orderId: order.id } });
  if (order.kitchenStatus !== next!.status)
    await tx.order.update({
      where: { id: order.id },
      data: {
        kitchenStatus: next!.status,
        status: next!.status === 'READY' && !packing?.handoverRequired ? 'READY' : 'IN_PROGRESS',
        version: { increment: 1 },
        updatedByUserId: actor,
      },
    });
  return ticket;
}
