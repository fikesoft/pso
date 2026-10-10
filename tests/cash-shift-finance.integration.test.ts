import { openCashShift } from './api/cash-shift-setup';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareCashShifts } from './api/cash-shifts-setup';
import { closeOperations } from './api/operations-setup';
import type { CashShiftsFixture } from './api/cash-shifts.types';

let f: CashShiftsFixture;
beforeAll(async () => {
  f = await prepareCashShifts();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('finanțe: efectele noi cer tura proprie OPEN în tenantul și locația comenzii', async () => {
  const order = await f.order();
  const actor = f.actors.cashier!.session;
  const body = {
    version: order.version,
    requestKey: randomUUID(),
    confirmed: true,
    payments: [{ method: 'CARD', amount: '1' }],
  };
  const path = `/orders/${order.id}/payments`;
  const missing = await actor.call(path, 'POST', body);
  expect(missing.status).toBe(409);
  expect(missing.data.code).toBe('CASH_SHIFT_REQUIRED');
  const own = await f.open(actor, '0');
  const other = await f.open(f.actors.other!.session, '0');
  const wrong = await actor.call(path, 'POST', { ...body, cashShiftId: other.shift.id });
  expect(wrong.status).toBe(403);
  expect(wrong.data.code).toBe('CASH_SHIFT_NOT_OWNER');
  expect(
    (await f.a.primary.call(path, 'POST', { ...body, cashShiftId: own.shift.id })).status,
  ).toBe(403);
  const foreign = await openCashShift(f.b.primary, f.b.primary, f.b.location.id);
  expect((await actor.call(path, 'POST', { ...body, cashShiftId: foreign.id })).status).toBe(404);
  const elsewhere = await f.cashShift(f.a.primary, f.otherLocation.id);
  expect(
    (await f.a.primary.call(path, 'POST', { ...body, cashShiftId: elsewhere.id })).status,
  ).toBe(404);
  await f.close(own.shift.id, actor);
  const closed = await actor.call(path, 'POST', { ...body, cashShiftId: own.shift.id });
  expect(closed.status).toBe(409);
  expect(closed.data.code).toBe('CASH_SHIFT_NOT_OPEN');
  expect((await f.a.primary.expect(`/orders/${order.id}/payments`)).payments).toHaveLength(0);
});

it('sumar: numerarul folosește suma încasată, split are un bump, comenzile și refundurile sunt distincte', async () => {
  const actor = f.actors.cashier!.session;
  const { shift } = await f.open(actor, '100');
  const order = await f.order();
  const paid = await actor.expect(`/orders/${order.id}/payments`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
    cashShiftId: shift.id,
    confirmed: true,
    payments: [
      { method: 'CASH', amount: '10', receivedAmount: '20' },
      { method: 'CARD', amount: '50' },
    ],
  });
  const first = await f.detail(shift.id, actor);
  expect(first.shift.version).toBe(2);
  expect(first.summary).toEqual({
    cashCollected: '10.00',
    cashRefunded: '0.00',
    cashIn: '0.00',
    cashOut: '0.00',
    expectedCash: '110.00',
    cardCollected: '50.00',
    cardRefunded: '0.00',
    cardNet: '50.00',
    paidOrderCount: 1,
    refundOperationCount: 0,
  });
  const ledger = await actor.expect(`/orders/${order.id}/payments`);
  const cash = ledger.payments.find((payment: { method: string }) => payment.method === 'CASH');
  expect(cash).toMatchObject({ amount: '10.00', receivedAmount: '20.00', changeAmount: '10.00' });
  await actor.expect(`/orders/${order.id}/refunds`, 'POST', {
    version: paid.order.version,
    requestKey: randomUUID(),
    cashShiftId: shift.id,
    confirmed: true,
    reason: 'Restituire parțială',
    refunds: [{ paymentId: cash.id, amount: '3' }],
  });
  const current = await f.detail(shift.id, actor);
  expect(current.shift.version).toBe(3);
  expect(current.summary).toEqual({
    ...first.summary,
    cashRefunded: '3.00',
    expectedCash: '107.00',
    refundOperationCount: 1,
  });
  const closed = await f.close(shift.id, actor, {
    countedCash: '109',
    discrepancyReason: 'Surplus constatat în sertar',
  });
  expect(closed.closing).toMatchObject({
    expectedCash: '107.00',
    countedCash: '109.00',
    difference: '2.00',
    summary: current.summary,
  });
  expect((await f.detail(shift.id, actor)).summary).toEqual(current.summary);
});

it('refund: tura curentă finanțată restituie încasarea veche fără să modifice snapshotul închis', async () => {
  const collector = f.actors.cashier!.session;
  const refunder = f.actors.other!.session;
  const old = await f.open(collector, '0');
  const order = await f.order();
  const paid = await collector.expect(`/orders/${order.id}/payments`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
    cashShiftId: old.shift.id,
    confirmed: true,
    payments: [
      { method: 'CASH', amount: '10', receivedAmount: '10' },
      { method: 'CARD', amount: '5' },
    ],
  });
  const ledger = await collector.expect(`/orders/${order.id}/payments`);
  await f.close(old.shift.id, collector);
  const frozen = await f.detail(old.shift.id, collector);
  const poor = await f.open(refunder, '0');
  const refunds = ledger.payments.map((payment: { id: string }) => ({
    paymentId: payment.id,
    amount: '1',
  }));
  const body = {
    version: paid.order.version,
    requestKey: randomUUID(),
    cashShiftId: poor.shift.id,
    confirmed: true,
    reason: 'Retur mixt atomic',
    refunds,
  };
  const rejected = await refunder.call(`/orders/${order.id}/refunds`, 'POST', body);
  expect(rejected.status).toBe(409);
  expect(rejected.data.code).toBe('CASH_BALANCE_INSUFFICIENT');
  expect((await f.detail(poor.shift.id, refunder)).shift.version).toBe(1);
  expect(
    (await collector.expect(`/orders/${order.id}/payments`)).payments.every(
      (payment: { refundedAmount: string }) => payment.refundedAmount === '0.00',
    ),
  ).toBe(true);
  const funded = await f.open(refunder, '5');
  await refunder.expect(`/orders/${order.id}/refunds`, 'POST', {
    ...body,
    requestKey: randomUUID(),
    cashShiftId: funded.shift.id,
  });
  expect((await f.detail(funded.shift.id, refunder)).summary).toMatchObject({
    expectedCash: '4.00',
    cashRefunded: '1.00',
    cardRefunded: '1.00',
    cardNet: '-1.00',
    refundOperationCount: 1,
    paidOrderCount: 0,
  });
  expect(await f.detail(old.shift.id, collector)).toEqual(frozen);
});

it('MANUAL CASH/CARD/zero cere tura, iar DEMO nu creează activitate și refuză id-ul injectat', async () => {
  const { shift } = await f.open(f.a.primary, '0');
  const foreign = await openCashShift(f.b.primary, f.b.primary, f.b.location.id);
  const elsewhere = await f.cashShift(f.a.primary, f.otherLocation.id);
  for (const [method, price] of [
    ['CASH', '10'],
    ['CARD', '20'],
    ['CASH', '0'],
  ]) {
    const order = await f.order(true, price);
    const body = {
      version: order.version,
      requestKey: randomUUID(),
      method,
      confirmed: true,
      ...(method === 'CASH' ? { receivedAmount: price } : {}),
    };
    const missing = await f.a.primary.call(`/orders/${order.id}/checkout/manual`, 'POST', body);
    expect(missing.status).toBe(409);
    expect(missing.data.code).toBe('CASH_SHIFT_REQUIRED');
    for (const cashShiftId of [foreign.id, elsewhere.id]) {
      const scoped = await f.a.primary.call(`/orders/${order.id}/checkout/manual`, 'POST', {
        ...body,
        cashShiftId,
      });
      expect(scoped.status).toBe(404);
      expect((await f.a.primary.expect(`/orders/${order.id}`)).order.version).toBe(order.version);
      expect((await f.a.primary.expect(`/orders/${order.id}/payments`)).payments).toEqual([]);
    }
    const paid = await f.a.primary.expect(`/orders/${order.id}/checkout/manual`, 'POST', {
      ...body,
      cashShiftId: shift.id,
    });
    expect(paid.receipt.isFiscal).toBe(false);
  }
  const before = await f.detail(shift.id);
  expect(before.shift.version).toBe(4);
  expect(before.summary).toMatchObject({
    cashCollected: '10.00',
    cardCollected: '20.00',
    expectedCash: '10.00',
    paidOrderCount: 3,
  });
  const demo = await f.order(true);
  const body = { version: demo.version, requestKey: randomUUID() };
  expect(
    (
      await f.a.primary.call(`/orders/${demo.id}/checkout/demo`, 'POST', {
        ...body,
        cashShiftId: shift.id,
      })
    ).status,
  ).toBe(400);
  const result = await f.a.primary.expect(`/orders/${demo.id}/checkout/demo`, 'POST', body);
  expect(result.receipt.paymentId).toBeNull();
  expect(await f.detail(shift.id)).toEqual(before);
});

it('concurență financiară: plata sau refundul serializează închiderea pe versiunea turei', async () => {
  const actor = f.actors.cashier!.session;
  for (const action of ['payments', 'refunds']) {
    const { shift } = await f.open(actor, '100');
    const order = await f.order();
    let version = order.version;
    let shiftVersion = shift.version;
    let paymentId = '';
    if (action === 'refunds') {
      const paid = await actor.expect(`/orders/${order.id}/payments`, 'POST', {
        version,
        requestKey: randomUUID(),
        cashShiftId: shift.id,
        confirmed: true,
        payments: [{ method: 'CASH', amount: '5', receivedAmount: '5' }],
      });
      version = paid.order.version;
      shiftVersion++;
      paymentId = (await actor.expect(`/orders/${order.id}/payments`)).payments[0].id;
    }
    const body = {
      version,
      requestKey: randomUUID(),
      cashShiftId: shift.id,
      confirmed: true,
      ...(action === 'payments'
        ? { payments: [{ method: 'CARD', amount: '1' }] }
        : { reason: 'Rambursare concurentă', refunds: [{ paymentId, amount: '1' }] }),
    };
    const results = await Promise.all([
      actor.call(`/orders/${order.id}/${action}`, 'POST', body),
      actor.call(`/cash-shifts/${shift.id}/close`, 'POST', {
        locationId: f.locationId,
        version: shiftVersion,
        requestKey: randomUUID(),
        countedCash: action === 'payments' ? '100' : '105',
      }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const current = await f.detail(shift.id, actor);
    expect(current.shift.version).toBe(shiftVersion + 1);
    expect(current.shift.status).toBe(results[1]!.status === 200 ? 'CLOSED' : 'OPEN');
    const operations = (await actor.expect(`/orders/${order.id}/payment-operations`)).operations;
    expect(operations).toHaveLength(
      (action === 'refunds' ? 1 : 0) + (results[0]!.status === 200 ? 1 : 0),
    );
  }
});
