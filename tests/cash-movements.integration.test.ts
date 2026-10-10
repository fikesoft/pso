import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareCashMovements } from './api/cash-movements-setup';
import { closeOperations } from './api/operations-setup';
import type { CashMovementsFixture } from './api/cash-movements.types';

let f: CashMovementsFixture;
beforeAll(async () => {
  f = await prepareCashMovements();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('numerar: IN/OUT repetate au un singur efect per cheie și snapshot exact după CLOSE', async () => {
  const actor = f.movementActors.owner!.session;
  const { shift } = await f.open(actor, '100');
  const first = await f.move(shift.id, { amount: '20' });
  await f.move(shift.id, { direction: 'OUT', amount: '7', reason: 'Retragere autorizată' });
  await f.move(shift.id, { amount: '2' });
  await f.move(shift.id, { direction: 'OUT', amount: '2' });
  const current = await f.detail(shift.id, actor);
  expect(current.shift.version).toBe(5);
  expect(current.summary).toEqual({
    cashCollected: '0.00',
    cashRefunded: '0.00',
    cashIn: '22.00',
    cashOut: '9.00',
    expectedCash: '113.00',
    cardCollected: '0.00',
    cardRefunded: '0.00',
    cardNet: '0.00',
    paidOrderCount: 0,
    refundOperationCount: 0,
  });
  expect(first.movement).toMatchObject({
    shiftId: shift.id,
    shiftVersion: 2,
    kind: 'CASH_IN',
    direction: 'IN',
    amount: '20.00',
    actorUserId: f.movementActors.owner!.userId,
    currency: 'MDL',
  });
  const closed = await f.close(shift.id, actor);
  expect(closed.closing.summary).toEqual(current.summary);
  expect(await actor.expect(`/cash-shifts/${shift.id}/movements`, 'POST', first.body)).toEqual({
    movement: first.movement,
  });
  for (const change of [
    { amount: '21' },
    { reason: 'Alt motiv documentat' },
    { version: 2 },
    { direction: 'OUT' },
  ])
    expect(
      (await actor.call(`/cash-shifts/${shift.id}/movements`, 'POST', { ...first.body, ...change }))
        .status,
    ).toBe(409);
  const fresh = await actor.call(`/cash-shifts/${shift.id}/movements`, 'POST', f.body(6));
  expect(fresh.status).toBe(409);
  expect(fresh.data.code).toBe('CASH_SHIFT_NOT_OPEN');
  expect((await f.list(shift.id)).movements).toHaveLength(5);
  expect((await f.detail(shift.id, actor)).closing).toEqual(closed.closing);
});

it('numerar: insuficiența, versiunea și formele invalide nu lasă efecte parțiale', async () => {
  const actor = f.movementActors.owner!.session;
  const { shift } = await f.open(actor, '5');
  const path = `/cash-shifts/${shift.id}/movements`;
  const before = await f.detail(shift.id, actor);
  const excess = await actor.call(path, 'POST', f.body(1, { direction: 'OUT', amount: '5.01' }));
  expect(excess.status).toBe(409);
  expect(excess.data.code).toBe('CASH_BALANCE_INSUFFICIENT');
  const stale = await actor.call(path, 'POST', f.body(2));
  expect(stale.status).toBe(409);
  expect(stale.data.code).toBe('CASH_SHIFT_VERSION_CONFLICT');
  for (const change of [
    ...['0', '-1', '1.001', 'NaN', 'Infinity'].map((amount) => ({ amount })),
    { reason: 'ab' },
    { reason: 'x'.repeat(501) },
    { actorUserId: randomUUID() },
    { kind: 'CASH_IN' },
    { direction: 'TRANSFER' },
    { orderId: randomUUID() },
  ])
    expect((await actor.call(path, 'POST', f.body(1, change))).status).toBe(400);
  expect(await f.detail(shift.id, actor)).toEqual(before);
  expect((await f.list(shift.id)).movements).toHaveLength(1);
  await f.move(shift.id, { direction: 'OUT', amount: '5' });
  expect((await f.detail(shift.id, actor)).summary.expectedCash).toBe('0.00');
});

it('numerar: owner obligatoriu chiar pentru admin; scope, CSRF și no-store sunt independente', async () => {
  const actor = f.movementActors.owner!.session;
  const { shift } = await f.open(actor, '0');
  const path = `/cash-shifts/${shift.id}/movements`;
  const body = f.body(1);
  const admin = await f.a.primary.call(path, 'POST', body);
  expect(admin.status).toBe(403);
  expect(admin.data.code).toBe('CASH_SHIFT_NOT_OWNER');
  expect((await actor.call(path, 'POST', body, {}, false)).status).toBe(403);
  expect((await actor.call(path, 'POST', body, { origin: 'http://127.0.0.1:9' })).status).toBe(403);
  expect((await actor.call(path, 'POST', body, { 'idempotency-key': randomUUID() })).status).toBe(
    400,
  );
  expect(
    (await f.b.primary.call(path, 'POST', { ...body, locationId: f.b.location.id })).status,
  ).toBe(404);
  expect(
    (await f.a.primary.call(path, 'POST', { ...body, locationId: f.otherLocation.id })).status,
  ).toBe(404);
  const reader = f.movementActors.reader!.session;
  const own = await f.open(reader, '0');
  expect((await reader.call(`/cash-shifts/${own.shift.id}/movements`, 'POST', body)).status).toBe(
    403,
  );
  const saved = await actor.call(path, 'POST', body);
  expect(saved.status).toBe(200);
  expect(saved.headers.get('cache-control')).toBe('no-store');
  expect((await actor.call(path, 'POST', body)).data).toEqual(saved.data);
});

it('numerar: OUT/OUT și IN/OUT versus CLOSE serializează versiunea fără sold negativ', async () => {
  const actor = f.movementActors.owner!.session;
  for (const direction of ['IN', 'OUT']) {
    const { shift } = await f.open(actor, '10');
    const results = await Promise.all([
      actor.call(
        `/cash-shifts/${shift.id}/movements`,
        'POST',
        f.body(1, { direction, amount: '7' }),
      ),
      actor.call(`/cash-shifts/${shift.id}/close`, 'POST', {
        locationId: f.locationId,
        version: 1,
        requestKey: randomUUID(),
        countedCash: '10',
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await f.detail(shift.id, actor)).shift.version).toBe(2);
  }
  const { shift } = await f.open(actor, '10');
  const results = await Promise.all(
    [1, 2].map(() =>
      actor.call(
        `/cash-shifts/${shift.id}/movements`,
        'POST',
        f.body(1, { direction: 'OUT', amount: '7' }),
      ),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await f.detail(shift.id, actor)).summary.expectedCash).toBe('3.00');
  expect((await f.list(shift.id)).movements).toHaveLength(2);
});
