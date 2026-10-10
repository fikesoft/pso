import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareCashMovements } from './api/cash-movements-setup';
import { closeOperations } from './api/operations-setup';
import type { CashMovementsFixture } from './api/cash-movements.types';
import type { CashMovementListResponse } from '../packages/contracts/src/cash-movements';

let f: CashMovementsFixture;
beforeAll(async () => {
  f = await prepareCashMovements();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('ledger numerar: plățile/refundurile și IN/OUT păstrează sursele opace și suma reală fără rest', async () => {
  const actor = f.a.primary;
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
  const payments = (await actor.expect(`/orders/${order.id}/payments`)).payments;
  const cash = payments.find((p: { method: string }) => p.method === 'CASH');
  await actor.expect(`/orders/${order.id}/refunds`, 'POST', {
    version: paid.order.version,
    requestKey: randomUUID(),
    cashShiftId: shift.id,
    confirmed: true,
    reason: 'Motiv privat al refundului',
    refunds: [{ paymentId: cash.id, amount: '3' }],
  });
  await f.move(shift.id, { amount: '5', reason: 'Fond pentru rest' }, actor);
  await f.move(shift.id, { direction: 'OUT', amount: '2', reason: 'Retragere documentată' }, actor);
  const before = await f.detail(shift.id);
  expect(before.summary).toMatchObject({
    expectedCash: '110.00',
    cardNet: '50.00',
    cashIn: '5.00',
    cashOut: '2.00',
    paidOrderCount: 1,
    refundOperationCount: 1,
  });
  const reporter = f.movementActors.reporter!.session;
  const response = await reporter.call(
    `/cash-shifts/${shift.id}/movements?locationId=${f.locationId}`,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const result: CashMovementListResponse = response.data;
  expect(result.timezone).toBe('Europe/Chisinau');
  expect(result.movements.map((m) => [m.kind, m.amount, m.direction])).toEqual([
    ['CASH_OUT', '2.00', 'OUT'],
    ['CASH_IN', '5.00', 'IN'],
    ['REFUND', '3.00', 'OUT'],
    ['PAYMENT', '10.00', 'IN'],
    ['OPENING', '100.00', 'IN'],
  ]);
  expect(result.movements.filter((m) => m.reason !== null).map((m) => m.reason)).toEqual([
    'Retragere documentată',
    'Fond pentru rest',
  ]);
  const serialized = JSON.stringify(result);
  for (const secret of [
    order.id,
    'orderId',
    'Motiv privat al refundului',
    'receivedAmount',
    'changeAmount',
    'receipt',
    'phone',
    'address',
    'products',
  ])
    expect(serialized).not.toContain(secret);
  for (const row of result.movements)
    expect(Object.keys(row.source).sort()).toEqual(['id', 'kind']);
  expect(await f.detail(shift.id)).toEqual(before);
  expect((await actor.expect(`/orders/${order.id}/payments`)).payments).toHaveLength(2);
  expect(
    (
      await f.movementActors.reader!.session.call(
        `/cash-shifts/${shift.id}/movements?locationId=${f.locationId}`,
      )
    ).status,
  ).toBe(403);
});

it('ledger numerar: paginarea reală peste50 nu omite și leagă cursorul de actor/locație/tură/limit', async () => {
  const actor = f.movementActors.owner!.session;
  const { shift } = await f.open(actor, '0');
  for (let version = 1; version <= 51; version++)
    await actor.expect(
      `/cash-shifts/${shift.id}/movements`,
      'POST',
      f.body(version, { amount: '1' }),
    );
  const first: CashMovementListResponse = await f.list(shift.id);
  expect(first.movements).toHaveLength(50);
  expect(first.nextCursor).toBeTypeOf('string');
  const query = `&cursor=${encodeURIComponent(first.nextCursor!)}`;
  const last: CashMovementListResponse = await f.list(shift.id, actor, query);
  expect(last.movements).toHaveLength(2);
  expect(last.nextCursor).toBeNull();
  expect(new Set([...first.movements, ...last.movements].map((m) => m.id)).size).toBe(52);
  const path = `/cash-shifts/${shift.id}/movements?locationId=${f.locationId}`;
  expect((await actor.call(`${path}${query}&limit=1`)).status).toBe(400);
  expect((await f.movementActors.reporter!.session.call(`${path}${query}`)).status).toBe(400);
  const second = await f.open(actor, '0');
  expect(
    (
      await actor.call(
        `/cash-shifts/${second.shift.id}/movements?locationId=${f.locationId}${query}`,
      )
    ).status,
  ).toBe(400);
  expect((await actor.call(`${path}&cursor=broken`)).status).toBe(400);
  expect((await actor.call(`${path}&limit=101`)).status).toBe(400);
  expect(
    (
      await f.b.primary.call(
        `/cash-shifts/${shift.id}/movements?locationId=${f.b.location.id}${query}`,
      )
    ).status,
  ).toBe(404);
  const record = f.movementActors.owner!;
  await f.a.primary.expect(`/staff/${record.userId}/overrides`, 'POST', {
    permission: 'cash.shifts.read',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.locationId,
  });
  const revoked = await f.login(record);
  expect((await revoked.call(`${path}${query}`)).status).toBe(403);
}, 60_000);
