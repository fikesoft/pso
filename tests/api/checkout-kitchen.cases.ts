import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { db } from './support/harness';
import type { CheckoutFixture } from './checkout.types';

export async function verifyCheckoutKitchen(f: CheckoutFixture) {
  const primary = f.a.primary;
  const location = (
    await primary.expect('/locations', 'POST', {
      name: 'Bucătărie pentru finalizare',
      code: 'CHECKOUT',
    })
  ).location;
  await primary.expect(`/catalog/products/${f.product.id}/locations/${location.id}`, 'PUT', {
    price: '10.0050',
    enabled: true,
  });
  const demo = await f.makeOrder({ locationId: location.id });
  const manual = await f.makeOrder({ locationId: location.id });
  const first = await f.makeOrder({ locationId: location.id });
  const second = await f.makeOrder({ locationId: location.id });
  await primary.expect(`/orders/${demo.id}/checkout/demo`, 'POST', {
    version: demo.version,
    requestKey: randomUUID(),
  });
  await primary.expect(`/orders/${manual.id}/checkout/manual`, 'POST', {
    version: manual.version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift(primary, location.id)).id,
    confirmed: true,
  });

  const path = `/kitchen/tickets?locationId=${location.id}`;
  const page = await primary.expect(`${path}&status=READY&limit=1`);
  expect(page.tickets).toHaveLength(1);
  expect(page.tickets[0]).toMatchObject({ orderId: first.id, status: 'READY' });
  expect(page.nextCursor).toBe(page.tickets[0].id);
  await primary.expect(`/orders/${first.id}/checkout/demo`, 'POST', {
    version: first.version,
    requestKey: randomUUID(),
  });
  const next = await primary.expect(`${path}&status=READY&limit=1&cursor=${page.nextCursor}`);
  expect(next.tickets).toHaveLength(1);
  expect(next.tickets[0]).toMatchObject({ orderId: second.id, status: 'READY' });
  expect(next.nextCursor).toBeNull();
  const all = await primary.expect(`${path}&limit=100`);
  expect(all.tickets).toHaveLength(1);
  expect(all.tickets[0].orderId).toBe(second.id);
  expect((await primary.expect(`${path}&status=QUEUED`)).tickets).toHaveLength(0);

  const history = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    (tx) =>
      tx.kitchenTicket.findMany({ where: { orderId: { in: [demo.id, manual.id, first.id] } } }),
  );
  expect(history).toHaveLength(3);
  for (const ticket of history) expect(ticket.status).toBe('READY');
}
