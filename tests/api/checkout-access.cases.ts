import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CheckoutFixture } from './checkout.types';

export async function verifyCheckoutAccess(f: CheckoutFixture) {
  const order = await f.makeOrder();
  const [cashier, waiter, limited, denied, noRead] = await Promise.all([
    f.login('cashier'),
    f.login('waiter'),
    f.login('limited'),
    f.login('denied'),
    f.login('noRead'),
  ]);
  const request = {
    version: order.version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
  };
  expect(
    (
      await waiter.call(`/orders/${order.id}/checkout/manual`, 'POST', {
        ...request,
        cashShiftId: (await f.cashShift(waiter)).id,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await cashier.call(`/orders/${order.id}/checkout/demo`, 'POST', {
        version: order.version,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(403);
  for (const unauthorized of [limited, denied, noRead])
    expect(
      (
        await unauthorized.call(`/orders/${order.id}/checkout/manual`, 'POST', {
          ...request,
          cashShiftId: (await f.cashShift(unauthorized)).id,
        })
      ).status,
    ).toBe(403);
  expect(
    (await f.b.primary.call(`/orders/${order.id}/checkout/manual`, 'POST', request)).status,
  ).toBe(404);
  expect((await f.b.primary.call(`/orders/${order.id}/receipt`)).status).toBe(404);
  const other = await f.makeOrder({ locationId: f.otherLocation.id });
  expect(
    (
      await cashier.call(`/orders/${other.id}/checkout/manual`, 'POST', {
        ...request,
        version: other.version,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await waiter.call(`/orders/${other.id}/checkout/demo`, 'POST', {
        version: other.version,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(403);
  expect((await cashier.call(`/orders/${other.id}/receipt`)).status).toBe(403);
  const completed = await f.a.primary.expect(
    `/orders/${order.id}/checkout/manual`,
    'POST',
    request,
  );
  // Replays are never an exception to current money limits or DENY.
  for (const unauthorized of [limited, denied, noRead])
    expect(
      (await unauthorized.call(`/orders/${order.id}/checkout/manual`, 'POST', request)).status,
    ).toBe(403);
  expect((await noRead.call(`/orders/${order.id}/receipt`)).status).toBe(403);
  expect((await waiter.expect(`/orders/${order.id}/receipt`)).receipt.id).toBe(
    completed.receipt.id,
  );
  const affordable = await f.makeOrder({
    items: [{ productId: f.secondProduct.id, quantity: '1' }],
  });
  const below = await limited.expect(`/orders/${affordable.id}/checkout/manual`, 'POST', {
    cashShiftId: (await f.cashShift(limited)).id,
    version: affordable.version,
    requestKey: randomUUID(),
    method: 'CARD',
    confirmed: true,
  });
  expect(below.receipt.total).toBe('5.25');
}
