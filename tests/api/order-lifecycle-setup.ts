import { randomUUID } from 'node:crypto';
import { prepareOperations } from './operations-setup';
import { db } from './support/harness';

export async function prepareOrderLifecycle() {
  const f = await prepareOperations();
  const material = (
    await f.a.primary.expect('/inventory/items', 'POST', {
      name: 'Ambalaj ciclu comandă',
      sku: randomUUID(),
      kind: 'PACKAGING',
      unit: 'PCS',
    })
  ).item;
  await f.a.primary.expect(`/inventory/recipes/${f.product.id}`, 'POST', {
    expectedVersion: 0,
    requestKey: randomUUID(),
    reason: 'Rețetă sintetică de verificare',
    components: [
      {
        inventoryItemId: material.id,
        purpose: 'PACKAGING',
        quantityPerUnit: '1',
        serviceTypes: ['PICKUP'],
      },
    ],
  });
  const draft = () =>
    f.draft({
      serviceType: 'PICKUP',
      tableLabel: undefined,
      items: [{ productId: f.product.id, quantity: '2' }],
    });
  const create = async () => (await f.a.primary.expect('/orders', 'POST', draft())).order;
  const current = async (id: string) => (await f.a.primary.expect(`/orders/${id}`)).order;
  const confirm = async (id: string) => {
    const order = await current(id);
    const body = { version: order.version, requestKey: randomUUID() };
    return { body, ...(await f.a.primary.expect(`/orders/${id}/confirm`, 'POST', body)) };
  };
  const send = async (id: string) => {
    const order = await current(id);
    return f.a.primary.expect(`/orders/${id}/send`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
    });
  };
  const prepare = async (ticketId: string, version: number, status: string) =>
    f.cook.expect(`/kitchen/tickets/${ticketId}`, 'PATCH', { version, status });
  const stored = (id: string) =>
    db.withTenantTransaction(
      db.runtime,
      { organizationId: f.a.company.organization.id },
      async (tx) => ({
        order: await tx.order.findUniqueOrThrow({ where: { id } }),
        reservation: await tx.inventoryReservation.findFirst({ where: { orderId: id } }),
        ticket: await tx.kitchenTicket.findFirst({ where: { orderId: id } }),
        documents: await tx.inventoryDocument.count({ where: { orderId: id } }),
        payments: await tx.payment.count({ where: { orderId: id } }),
        events: await tx.orderStatusEvent.findMany({
          where: { orderId: id },
          orderBy: { createdAt: 'asc' },
        }),
      }),
    );
  const stock = async () =>
    (await f.a.primary.expect(`/inventory/items/${material.id}?locationId=${f.a.location.id}`))
      .item;
  return { ...f, material, create, current, confirm, send, prepare, stored, stock };
}
