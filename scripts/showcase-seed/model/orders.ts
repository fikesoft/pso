import { withTenantTransaction } from '../../../packages/db/src/index';
import { SHOWCASE, ORDER_SCENARIOS, SERVICE_ROTATION, ORDER_NOTES } from '../config/seed.constants';
import { seedKey } from './record';
import { seedPacking } from './packing';
import { seedFinancial } from './financial';
import { seedDelivery } from './delivery';
import type { OrderResult, SeedClients, SeedLocationContext } from './seed.types';

export async function seedLocationOrders(clients: SeedClients, context: SeedLocationContext) {
  for (let cycle = 0; cycle < SHOWCASE.cycles; cycle++)
    for (const [scenarioIndex, scenario] of ORDER_SCENARIOS.entries()) {
      const index = cycle * ORDER_SCENARIOS.length + scenarioIndex;
      const requestKey = seedKey(context.record, `order:${context.locationIndex}:${index}`);
      const done = await withTenantTransaction(
        clients.runtime,
        { organizationId: context.references.organizationId },
        (tx) =>
          tx.auditEvent.findFirst({
            where: { action: 'showcase.order.complete', requestId: requestKey },
          }),
      );
      if (done) continue;
      try {
        const orderId = await seedOrder(clients, context, index, scenario, requestKey);
        await withTenantTransaction(
          clients.runtime,
          { organizationId: context.references.organizationId, userId: context.references.adminId },
          (tx) =>
            tx.auditEvent.create({
              data: {
                organizationId: context.references.organizationId,
                locationId: context.references.locationIds[context.locationIndex],
                actorPlatformAdminId: context.record.platform.id,
                action: 'showcase.order.complete',
                targetType: 'ORDER',
                targetId: orderId,
                requestId: requestKey,
                outcome: 'SUCCESS',
                metadata: { synthetic: true, scenario, seedId: context.record.id },
              },
            }),
        );
      } catch (error) {
        throw new Error(
          `Comandă DEMO ${context.locationIndex + 1}/${index + 1} (${scenario}): ${error instanceof Error ? error.message : 'eroare'}`,
        );
      }
    }
}

async function seedOrder(
  clients: SeedClients,
  context: SeedLocationContext,
  index: number,
  scenario: string,
  requestKey: string,
) {
  const { record, references, locationIndex, operator, cook } = context;
  const locationId = references.locationIds[locationIndex]!;
  const serviceType =
    scenario === 'PACKING' ? 'TAKEAWAY' : SERVICE_ROTATION[index % SERVICE_ROTATION.length]!;
  const customer = context.customers[index % context.customers.length]!;
  const items = Array.from({ length: 2 + (index % 4) }, (_, position) => ({
    productId: references.products[(index * 5 + position * 7) % references.products.length]!.id,
    quantity: String(1 + ((index + position) % 3)),
    ...(position === 0 ? { note: 'DEMO · sosurile separat; observație pentru preparare.' } : {}),
  }));
  let { order } = await operator.call<OrderResult>('/orders', 'POST', {
    locationId,
    serviceType,
    source: index % 2 === 0 ? 'POS' : 'PHONE',
    requestKey,
    ...(serviceType === 'DINE_IN' ? { tableLabel: `M${(index % 8) + 1}` } : {}),
    ...(serviceType === 'DELIVERY'
      ? {
          deliveryAddress: {
            address: `Oraș DEMO, Strada Exemplului ${index + 1}`,
            instructions: 'Adresă sintetică; nu efectuați livrări reale.',
          },
        }
      : {}),
    customerRef: { id: customer.id, version: customer.version },
    items,
    notes: `${ORDER_NOTES[index % ORDER_NOTES.length]} Scenariu: ${scenario}. Seed: ${record.id}.`,
  });
  if (scenario === 'DRAFT') return order.id;
  if (scenario === 'CONFIRMED') {
    if (order.status === 'DRAFT')
      await operator.call(`/orders/${order.id}/confirm`, 'POST', {
        version: order.version,
        requestKey: seedKey(record, `confirm:${order.id}`),
      });
    return order.id;
  }
  if (order.kitchenStatus === 'NOT_SENT' && order.status !== 'CANCELLED') {
    ({ order } = await operator.call<OrderResult>(`/orders/${order.id}/send`, 'POST', {
      version: order.version,
      requestKey: seedKey(record, `send:${order.id}`),
    }));
  }
  if (scenario === 'CANCELLED') {
    if (order.status !== 'CANCELLED')
      await operator.call(`/orders/${order.id}/cancel`, 'POST', {
        version: order.version,
        requestKey: seedKey(record, `cancel:${order.id}`),
        reason: 'DEMO · anulare sintetică la solicitarea clientului de exercițiu',
      });
    return order.id;
  }
  if (scenario === 'QUEUED') return order.id;
  const ticket = await withTenantTransaction(
    clients.runtime,
    { organizationId: references.organizationId },
    (tx) => tx.kitchenTicket.findFirstOrThrow({ where: { orderId: order.id } }),
  );
  let ticketVersion = ticket.version;
  if (ticket.status === 'QUEUED') {
    await cook.call(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
      version: ticketVersion++,
      status: 'PREPARING',
    });
  }
  if (scenario === 'PREPARING') return order.id;
  if (ticket.status !== 'READY')
    await cook.call(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
      version: ticketVersion,
      status: 'READY',
    });
  if (order.status !== 'COMPLETED') {
    const packing = await withTenantTransaction(
      clients.runtime,
      { organizationId: references.organizationId },
      (tx) => tx.packingSession.findFirst({ where: { orderId: order.id, handoverRequired: true } }),
    );
    if (packing) await seedPacking(context, order.id, packing.id, scenario === 'PACKING');
  }
  if (scenario === 'PACKING' || scenario === 'READY') return order.id;
  await seedFinancial(clients, context, order.id, scenario);
  if (scenario !== 'DEMO') await seedDelivery(clients, context, order.id);
  return order.id;
}
