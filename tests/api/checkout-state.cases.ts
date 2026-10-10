import { completePacking } from './complete-packing';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CheckoutFixture } from './checkout.types';

export async function verifyCheckoutState(f: CheckoutFixture) {
  const cashier = await f.login('cashier');
  const order = await f.makeOrder({}, false);
  expect((await cashier.call(`/orders/${order.id}/receipt`)).status).toBe(404);
  const request = {
    version: 1,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift(cashier)).id,
    confirmed: true,
  };
  expect((await cashier.call(`/orders/${order.id}/checkout/manual`, 'POST', request)).status).toBe(
    409,
  );
  const sent = await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
    version: 1,
    requestKey: randomUUID(),
  });
  expect(
    (await cashier.call(`/orders/${order.id}/checkout/manual`, 'POST', { ...request, version: 2 }))
      .status,
  ).toBe(409);
  await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
    version: 1,
    status: 'PREPARING',
  });
  expect(
    (await cashier.call(`/orders/${order.id}/checkout/manual`, 'POST', { ...request, version: 3 }))
      .status,
  ).toBe(409);
  await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
    version: 2,
    status: 'READY',
  });
  expect(
    (await cashier.call(`/orders/${order.id}/checkout/manual`, 'POST', { ...request, version: 3 }))
      .status,
  ).toBe(409);
  expect(
    (await cashier.call(`/orders/${order.id}/checkout/manual`, 'POST', { ...request, version: 4 }))
      .status,
  ).toBe(409);
  const ready = await completePacking(f.a.primary, order.id);
  expect(
    (
      await cashier.call(`/orders/${order.id}/checkout/manual`, 'POST', {
        ...request,
        version: ready.version,
        method: 'CASH',
        receivedAmount: '10.00',
      })
    ).status,
  ).toBe(400);
  for (const overrides of [
    { receivedAmount: '20.00' },
    { confirmed: false },
    { confirmed: undefined },
    { total: '0.01' },
    { organizationId: f.b.company.organization.id },
    { method: 'CASH', receivedAmount: 20 },
  ]) {
    expect(
      (
        await cashier.call(`/orders/${order.id}/checkout/manual`, 'POST', {
          ...request,
          version: ready.version,
          ...overrides,
        })
      ).status,
    ).toBe(400);
  }
  expect((await f.stored(order.id)).checkouts).toHaveLength(0);
  const completed = await cashier.expect(`/orders/${order.id}/checkout/manual`, 'POST', {
    ...request,
    version: ready.version,
    method: 'CASH',
    receivedAmount: '9007199254740993.01',
  });
  expect(completed.receipt).toMatchObject({
    total: '10.01',
    receivedAmount: '9007199254740993.01',
    changeAmount: '9007199254740983.00',
  });
  expect(
    (
      await cashier.call(`/orders/${order.id}/checkout/manual`, 'POST', {
        ...request,
        version: completed.order.version,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
}

export async function verifyCheckoutRaces(f: CheckoutFixture) {
  const [cashier, waiter] = await Promise.all([f.login('cashier'), f.login('waiter')]);
  const order = await f.makeOrder();
  const demo = { version: order.version, requestKey: randomUUID() };
  const manual = {
    version: order.version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift(cashier)).id,
    confirmed: true,
  };
  const results = await Promise.all([
    waiter.call(`/orders/${order.id}/checkout/demo`, 'POST', demo),
    cashier.call(`/orders/${order.id}/checkout/manual`, 'POST', manual),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const winner = results.find((result) => result.status === 200)!.data;
  const stored = await f.stored(order.id);
  expect(stored.checkouts).toHaveLength(1);
  expect(stored.payments).toHaveLength(winner.receipt.mode === 'MANUAL' ? 1 : 0);
  expect(stored.events).toHaveLength(1);
  expect(stored.audits).toHaveLength(1);
  const fresh = await f.makeOrder();
  const conflictingKey = {
    version: fresh.version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift(cashier)).id,
    confirmed: true,
  };
  await cashier.expect(`/orders/${fresh.id}/checkout/manual`, 'POST', conflictingKey);
  const another = await f.makeOrder();
  expect(
    (
      await cashier.call(`/orders/${another.id}/checkout/manual`, 'POST', {
        ...conflictingKey,
        version: another.version,
      })
    ).status,
  ).toBe(409);
  expect((await f.stored(another.id)).checkouts).toHaveLength(0);
}
