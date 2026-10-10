import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOrderResponsibilities } from './api/order-responsibilities-setup';
import { closeOperations } from './api/operations-setup';
import type { ResponsibilityFixture } from './api/order-responsibilities.types';

let f: ResponsibilityFixture;
beforeAll(async () => {
  f = await prepareOrderResponsibilities();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('responsabilitate derivată: plata parțială/refundul păstrează ownerul, achitarea rezolvă și refundul redeschide neasumat', async () => {
  const outgoing = f.responsibilityActors.outgoing!.session;
  const assignedShift = await f.open(outgoing, '0');
  const payout = await f.open(f.a.primary, '100');
  const order = await f.order(false, '20');
  await f.assign(order.id, assignedShift.shift.id);
  const path = `/orders/${order.id}`;
  const collect = async (amount: string) => {
    const current = await f.a.primary.expect(path);
    return f.a.primary.expect(`${path}/payments`, 'POST', {
      version: current.order.version,
      requestKey: randomUUID(),
      cashShiftId: payout.shift.id,
      confirmed: true,
      payments: [{ method: 'CARD', amount }],
    });
  };
  await collect('5');
  const afterPartial = await f.current(order.id);
  expect(afterPartial.responsibility).toMatchObject({
    state: 'ASSIGNED',
    version: 1,
    owner: { userId: f.responsibilityActors.outgoing!.userId },
  });
  expect(afterPartial.order.outstandingAmount).toBe('15.00');
  const ledger = await f.a.primary.expect(`${path}/payments`);
  const refund = async () => {
    const current = await f.a.primary.expect(path);
    return f.a.primary.expect(`${path}/refunds`, 'POST', {
      version: current.order.version,
      requestKey: randomUUID(),
      cashShiftId: payout.shift.id,
      confirmed: true,
      reason: 'Restituire legitimă pe tura curentă',
      refunds: [{ paymentId: ledger.payments[0].id, amount: '1' }],
    });
  };
  await refund();
  expect((await f.current(order.id)).responsibility).toEqual(afterPartial.responsibility);
  await collect('16');
  expect((await f.current(order.id)).responsibility).toMatchObject({
    state: 'RESOLVED',
    version: 2,
    owner: null,
    shift: null,
  });
  expect((await f.history(order.id)).events[0].kind).toBe('RESOLVED_PAID');
  await f.close(assignedShift.shift.id, outgoing);
  const frozen = await f.detail(assignedShift.shift.id, outgoing);
  await refund();
  const reopened = await f.current(order.id);
  expect(reopened.responsibility).toMatchObject({
    state: 'UNASSIGNED',
    version: 3,
    owner: null,
    shift: null,
  });
  expect(reopened.order.outstandingAmount).toBe('1.00');
  expect((await f.history(order.id)).events.map((event: { kind: string }) => event.kind)).toEqual([
    'REOPENED_UNASSIGNED',
    'RESOLVED_PAID',
    'ASSIGN',
  ]);
  const row = (await f.queue({})).orders.find(
    (entry: { order: { id: string } }) => entry.order.id === order.id,
  );
  expect(row.provenance.kind).toBe('REFUND_REOPENED');
  expect(await f.detail(assignedShift.shift.id, outgoing)).toEqual(frozen);
});

it('responsabilitate derivată: MANUAL rezolvă plata, DEMO are cauză distinctă și zero efect monetar', async () => {
  const outgoing = f.responsibilityActors.outgoing!.session;
  const payout = await f.open();
  for (const mode of ['manual', 'demo']) {
    const assigned = await f.open(outgoing, '0');
    const order = await f.order(true, '20');
    await f.assign(order.id, assigned.shift.id);
    const before = await f.detail(payout.shift.id);
    const result = await f.a.primary.expect(`/orders/${order.id}/checkout/${mode}`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
      ...(mode === 'manual'
        ? { cashShiftId: payout.shift.id, method: 'CARD', confirmed: true }
        : {}),
    });
    expect(result.order.status).toBe('COMPLETED');
    expect((await f.current(order.id)).responsibility).toMatchObject({
      state: 'RESOLVED',
      owner: null,
      shift: null,
    });
    expect((await f.history(order.id)).events[0].kind).toBe(
      mode === 'manual' ? 'RESOLVED_PAID' : 'RESOLVED_DEMO',
    );
    if (mode === 'demo') {
      expect(await f.detail(payout.shift.id)).toEqual(before);
      expect((await f.a.primary.expect(`/orders/${order.id}/payments`)).payments).toEqual([]);
    }
    await f.close(assigned.shift.id, outgoing);
  }
});

it('responsabilitate derivată: anularea cu net încasat este refuzată, refundul permite anularea legală', async () => {
  const outgoing = f.responsibilityActors.outgoing!.session;
  const { shift } = await f.open(outgoing, '0');
  const payout = await f.open();
  const order = await f.order(false, '20');
  await f.assign(order.id, shift.id);
  const path = `/orders/${order.id}`;
  const paid = await f.a.primary.expect(`${path}/payments`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
    cashShiftId: payout.shift.id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '5' }],
  });
  expect(
    (
      await f.a.primary.call(`${path}/cancel`, 'POST', {
        version: paid.order.version,
        requestKey: randomUUID(),
        reason: 'Anulare înainte de restituire',
      })
    ).status,
  ).toBe(409);
  expect((await f.current(order.id)).responsibility.state).toBe('ASSIGNED');
  const ledger = await f.a.primary.expect(`${path}/payments`);
  const refunded = await f.a.primary.expect(`${path}/refunds`, 'POST', {
    version: paid.order.version,
    requestKey: randomUUID(),
    cashShiftId: payout.shift.id,
    confirmed: true,
    reason: 'Restituire înainte de anulare',
    refunds: [{ paymentId: ledger.payments[0].id, amount: '5' }],
  });
  const canceled = await f.a.primary.expect(`${path}/cancel`, 'POST', {
    version: refunded.order.version,
    requestKey: randomUUID(),
    reason: 'Anulare după restituirea completă',
  });
  expect(canceled.order.status).toBe('CANCELLED');
  expect((await f.current(order.id)).responsibility.state).toBe('RESOLVED');
  expect((await f.history(order.id)).events[0].kind).toBe('RESOLVED_CANCELLED');
  expect((await f.a.primary.expect(`${path}/payments`)).payments[0]).toMatchObject({
    amount: '5.00',
    refundedAmount: '5.00',
  });
  await f.close(shift.id, outgoing);
});

it('responsabilitate compatibilă: plata și finalizarea comenzilor neasumate nu inventează owner sau jurnal', async () => {
  const payout = await f.open();
  const confirmed = await f.order(false, '10');
  await f.a.primary.expect(`/orders/${confirmed.id}/payments`, 'POST', {
    version: confirmed.version,
    requestKey: randomUUID(),
    cashShiftId: payout.shift.id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '10' }],
  });
  const ready = await f.order(true, '10');
  const completed = await f.a.primary.expect(`/orders/${ready.id}/complete`, 'POST', {
    version: ready.version,
    requestKey: randomUUID(),
  });
  expect(completed.order.status).toBe('COMPLETED');
  for (const order of [confirmed, ready]) {
    expect((await f.current(order.id)).responsibility).toMatchObject({
      version: 0,
      owner: null,
      shift: null,
    });
    expect((await f.history(order.id)).events).toEqual([]);
  }
  await f.close(payout.shift.id);
});
