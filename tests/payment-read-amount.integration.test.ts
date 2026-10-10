import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOrderSearch } from './api/order-search-setup';
import type { OrderSearchFixture } from './api/order-search.types';
import { closeOperations } from './api/operations-setup';

let f: OrderSearchFixture;
beforeAll(async () => {
  f = await prepareOrderSearch();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('applies the order read total independently of the smaller collect/refund amount and rechecks exact retries', async () => {
  for (const permission of ['payments.collect', 'payments.refund'])
    await f.a.primary.expect(`/staff/${f.reader.user.id}/overrides`, 'POST', {
      permission,
      effect: 'ALLOW',
      scopeType: 'LOCATION',
      locationId: f.a.location.id,
      limits: { maxAmount: '1' },
    });
  for (const permission of ['cash.registers.read', 'cash.shifts.read', 'cash.shifts.open'])
    await f.a.primary.expect(`/staff/${f.reader.user.id}/overrides`, 'POST', {
      permission,
      effect: 'ALLOW',
      scopeType: 'LOCATION',
      locationId: f.a.location.id,
    });
  const reader = await f.loginSearch();
  const readerShift = await f.cashShift(reader);
  const primaryShift = await f.cashShift();
  const high = await f.create({
    items: [{ productId: f.searchProduct.id, quantity: '10' }],
    customer: { name: 'Client confidențial', phone: '+37360000111' },
  });
  const low = await f.create({ items: [{ productId: f.searchProduct.id, quantity: '3' }] });
  for (const order of [high, low])
    await f.a.primary.expect(`/orders/${order.id}/confirm`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
    });
  const collectBody = (version: number) => ({
    version,
    requestKey: randomUUID(),
    cashShiftId: readerShift.id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '1' }],
  });
  const highBody = { ...collectBody(2), cashShiftId: primaryShift.id };
  const original = await f.a.primary.expect(`/orders/${high.id}/payments`, 'POST', highBody);
  const highHistory = await f.a.primary.expect(`/orders/${high.id}/payments`);
  for (const route of ['payments', 'payment-operations']) {
    const response = await reader.call(`/orders/${high.id}/${route}`);
    expect(response.status).toBe(403);
    expect(response.data).not.toHaveProperty('payments');
    expect(response.data).not.toHaveProperty('operations');
    expect(response.data).not.toHaveProperty('summary');
  }
  for (const body of [highBody, collectBody(original.order.version)]) {
    const response = await reader.call(`/orders/${high.id}/payments`, 'POST', body);
    expect(response.status).toBe(403);
    expect(response.data).not.toHaveProperty('order');
    expect(response.data).not.toHaveProperty('operation');
    expect(JSON.stringify(response.data)).not.toMatch(/Client confidențial|37360000111/);
  }
  expect(
    (
      await reader.call(`/orders/${high.id}/refunds`, 'POST', {
        version: original.order.version,
        requestKey: randomUUID(),
        cashShiftId: readerShift.id,
        confirmed: true,
        reason: 'Rambursare sintetică',
        refunds: [{ paymentId: highHistory.payments[0].id, amount: '1' }],
      })
    ).status,
  ).toBe(403);
  const lowBody = collectBody(2);
  const allowed = await reader.expect(`/orders/${low.id}/payments`, 'POST', lowBody);
  expect(allowed.order.total).toBe('3.00');
  const ledger = await reader.expect(`/orders/${low.id}/payments`);
  expect(ledger.payments).toHaveLength(1);
  expect((await reader.expect(`/orders/${low.id}/payment-operations`)).operations).toHaveLength(1);
  expect(
    (
      await reader.call(`/orders/${low.id}/payments`, 'POST', {
        ...collectBody(allowed.order.version),
        payments: [{ method: 'CARD', amount: '1.01' }],
      })
    ).status,
  ).toBe(403);
  await reader.expect(`/orders/${low.id}/refunds`, 'POST', {
    version: allowed.order.version,
    requestKey: randomUUID(),
    cashShiftId: readerShift.id,
    confirmed: true,
    reason: 'Rambursare parțială',
    refunds: [{ paymentId: ledger.payments[0].id, amount: '0.50' }],
  });
  expect((await reader.expect(`/orders/${low.id}/payments`, 'POST', lowBody)).operation.id).toBe(
    allowed.operation.id,
  );
  await f.a.primary.expect(`/staff/${f.reader.user.id}/overrides`, 'POST', {
    permission: 'orders.read',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.loginSearch();
  const retry = await denied.call(`/orders/${low.id}/payments`, 'POST', lowBody);
  expect(retry.status).toBe(403);
  expect(retry.data).not.toHaveProperty('order');
  expect(retry.data).not.toHaveProperty('operation');
  for (const route of ['payments', 'payment-operations'])
    expect((await denied.call(`/orders/${low.id}/${route}`)).status).toBe(403);
  expect((await f.a.primary.expect(`/orders/${high.id}/payments`)).payments).toHaveLength(1);
  expect((await f.a.primary.expect(`/orders/${low.id}/payments`)).payments).toHaveLength(1);
  expect(
    (await f.a.primary.expect(`/orders/${low.id}/payment-operations`)).operations,
  ).toHaveLength(2);
});
