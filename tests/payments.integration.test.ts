import { completePacking } from './api/complete-packing';
import { cashActorWithoutCollection } from './api/cash-shift-setup';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareOrderLifecycle } from './api/order-lifecycle-setup';
import type { OrderLifecycleFixture } from './api/order-lifecycle.types';
import { closeOperations } from './api/operations-setup';

let f: OrderLifecycleFixture;
beforeAll(async () => {
  f = await prepareOrderLifecycle();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

async function collect(id: string, payments: unknown[]) {
  const order = await f.current(id);
  return f.a.primary.expect(`/orders/${id}/payments`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    payments,
  });
}
async function refund(id: string, refunds: unknown[]) {
  const order = await f.current(id);
  return f.a.primary.expect(`/orders/${id}/refunds`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    reason: 'Rambursare sintetică parțială',
    refunds,
  });
}

it('accepts mixed prepayments, completes independently, collects later and refunds original installments', async () => {
  const draft = await f.create();
  await f.confirm(draft.id);
  const path = `/orders/${draft.id}`;
  const body = {
    version: 2,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    payments: [
      { method: 'CASH', amount: '2.01', receivedAmount: '5' },
      { method: 'CARD', amount: '3' },
    ],
  };
  const [a, b] = await Promise.all([
    f.a.primary.expect(`${path}/payments`, 'POST', body),
    f.a.primary.expect(`${path}/payments`, 'POST', {
      ...body,
      payments: [...body.payments].reverse(),
    }),
  ]);
  expect(a).toEqual(b);
  expect(a.order).toMatchObject({
    status: 'CONFIRMED',
    kitchenStatus: 'NOT_SENT',
    version: 3,
    paymentStatus: 'PARTIALLY_PAID',
    paymentSummary: { collectedAmount: '5.01', outstandingAmount: '15.00' },
    checkout: null,
  });
  expect(await f.stored(draft.id)).toMatchObject({ reservation: null, documents: 0, payments: 2 });
  let ledger = await f.a.primary.expect(`${path}/payments`);
  const cash = ledger.payments.find((p: { method: string }) => p.method === 'CASH');
  expect(cash).toMatchObject({ amount: '2.01', receivedAmount: '5.00', changeAmount: '2.99' });
  expect((await f.a.primary.call(`${path}/payments`, 'POST', { ...body, version: 3 })).status).toBe(
    409,
  );
  expect(
    (
      await f.a.primary.call(`${path}/payments`, 'POST', {
        ...body,
        requestKey: randomUUID(),
        version: 3,
        payments: [{ method: 'CARD', amount: '15.01' }],
      })
    ).status,
  ).toBe(409);
  const sent = await f.send(draft.id);
  await f.prepare(sent.ticket.id, 1, 'PREPARING');
  await f.prepare(sent.ticket.id, 2, 'READY');
  const ready = await completePacking(f.a.primary, draft.id);
  expect(
    (
      await f.a.primary.call(`${path}/checkout/manual`, 'POST', {
        version: ready.version,
        requestKey: randomUUID(),
        method: 'CARD',
        cashShiftId: (await f.cashShift()).id,
        confirmed: true,
      })
    ).status,
  ).toBe(409);
  await f.a.primary.expect(`${path}/complete`, 'POST', {
    version: ready.version,
    requestKey: randomUUID(),
  });
  const paid = await collect(draft.id, [{ method: 'CARD', amount: '15' }]);
  expect(paid.order).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID', checkout: null });
  expect((await f.stored(draft.id)).documents).toBe(1);
  await refund(draft.id, [{ paymentId: cash.id, amount: '1.01' }]);
  expect((await f.current(draft.id)).paymentStatus).toBe('PARTIALLY_REFUNDED');
  ledger = await f.a.primary.expect(`${path}/payments`);
  const refunded = await refund(
    draft.id,
    ledger.payments.map((p: { id: string; refundableAmount: string }) => ({
      paymentId: p.id,
      amount: p.refundableAmount,
    })),
  );
  expect(refunded.order).toMatchObject({
    status: 'COMPLETED',
    paymentStatus: 'REFUNDED',
    paymentSummary: { netPaidAmount: '0.00', outstandingAmount: '20.01' },
  });
  expect((await f.stored(draft.id)).documents).toBe(1);
  expect((await f.stock()).balance).toBe('-2.000000');
  expect((await collect(draft.id, [{ method: 'CARD', amount: '20.01' }])).order.paymentStatus).toBe(
    'PAID',
  );
  const operations = await f.a.primary.expect(`${path}/payment-operations`);
  expect(operations.operations.map((o: { kind: string }) => o.kind).sort()).toEqual([
    'COLLECT',
    'COLLECT',
    'COLLECT',
    'REFUND',
    'REFUND',
  ]);
  const replay = await f.a.primary.expect(`${path}/payments`, 'POST', body);
  expect(replay.operation).toEqual(a.operation);
  expect(replay.order.status).toBe('COMPLETED');
});

it('requires full refund before cancellation, retains history and rejects later collection', async () => {
  const draft = await f.create();
  await f.confirm(draft.id);
  const paid = await collect(draft.id, [{ method: 'CARD', amount: '5' }]);
  const path = `/orders/${draft.id}`;
  expect(
    (
      await f.a.primary.call(`${path}/cancel`, 'POST', {
        version: paid.order.version,
        reason: 'Clientul a renunțat',
      })
    ).status,
  ).toBe(409);
  const ledger = await f.a.primary.expect(`${path}/payments`);
  const returned = await refund(draft.id, [{ paymentId: ledger.payments[0].id, amount: '5' }]);
  const cancelled = await f.a.primary.expect(`${path}/cancel`, 'POST', {
    version: returned.order.version,
    requestKey: randomUUID(),
    reason: 'Rambursat și anulat',
  });
  expect(cancelled.order).toMatchObject({
    status: 'CANCELLED',
    paymentStatus: 'REFUNDED',
    paymentSummary: { collectedAmount: '5.00', refundedAmount: '5.00', outstandingAmount: '0.00' },
  });
  expect(
    (
      await f.a.primary.call(`${path}/payments`, 'POST', {
        version: cancelled.order.version,
        requestKey: randomUUID(),
        cashShiftId: (await f.cashShift()).id,
        confirmed: true,
        payments: [{ method: 'CARD', amount: '1' }],
      })
    ).status,
  ).toBe(409);
});

it('rejects client-controlled states, excessive precision, missing confirmation and wrong original payment', async () => {
  const noCollect = await cashActorWithoutCollection(
    f.a.primary,
    f.a.location.id,
    f.a.company.organization.slug,
  );
  const noCollectShift = await f.cashShift(noCollect);
  const original = await f.create();
  const base = {
    version: 1,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '1' }],
  };
  const path = `/orders/${original.id}`;
  expect((await f.a.primary.call(`${path}/payments`, 'POST', base)).status).toBe(409);
  await f.confirm(original.id);
  for (const changes of [
    { confirmed: false },
    { status: 'PAID' },
    { payments: [{ method: 'CARD', amount: '0.001' }] },
    { payments: [{ method: 'CARD', amount: '0' }] },
  ]) {
    expect(
      (await f.a.primary.call(`${path}/payments`, 'POST', { ...base, version: 2, ...changes }))
        .status,
    ).toBe(400);
  }
  expect(
    (
      await noCollect.call(`${path}/payments`, 'POST', {
        ...base,
        version: 2,
        cashShiftId: noCollectShift.id,
      })
    ).status,
  ).toBe(403);
  expect((await f.b.primary.call(`${path}/payments`, 'POST', { ...base, version: 2 })).status).toBe(
    404,
  );
  const paid = await collect(original.id, [{ method: 'CASH', amount: '5', receivedAmount: '5' }]);
  const refundBody = {
    version: paid.order.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    reason: 'Retur',
    refunds: [{ paymentId: randomUUID(), amount: '1' }],
  };
  expect((await f.a.primary.call(`${path}/refunds`, 'POST', refundBody)).status).toBe(404);
  expect(
    (await f.a.primary.call(`${path}/refunds`, 'POST', { ...refundBody, reason: '' })).status,
  ).toBe(400);
  expect((await f.current(original.id)).version).toBe(paid.order.version);
});

it('paginates payment and command history without leaking another order cursor', async () => {
  const order = await f.create();
  await f.confirm(order.id);
  for (let i = 0; i < 51; i++) await collect(order.id, [{ method: 'CARD', amount: '0.01' }]);
  const path = `/orders/${order.id}`;
  for (const route of ['payments', 'payment-operations']) {
    const property = route === 'payments' ? 'payments' : 'operations';
    const first = await f.a.primary.expect(`${path}/${route}`);
    const next = await f.a.primary.expect(`${path}/${route}?cursor=${first.nextCursor}`);
    expect(first[property]).toHaveLength(50);
    expect(next[property]).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
    expect(
      new Set([...first[property], ...next[property]].map((entry: { id: string }) => entry.id))
        .size,
    ).toBe(51);
    const other = await f.create();
    expect(
      (await f.a.primary.call(`/orders/${other.id}/${route}?cursor=${first.nextCursor}`)).status,
    ).toBe(400);
  }
});
