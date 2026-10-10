import { verifyReducedMovementLimit } from './api/cash-movement-reduced-limit';
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

it('numerar recovery: rezolvă snapshotul original după CLOSE și retrage terminal cheile necomise', async () => {
  const actor = f.movementActors.owner!.session;
  const { shift } = await f.open(actor, '20');
  const saved = await f.move(shift.id, { direction: 'OUT', amount: '7' });
  const command = {
    locationId: f.locationId,
    shiftId: shift.id,
    requestKey: saved.body.requestKey,
    kind: 'CASH_OUT',
  };
  const expected = { status: 'SUCCEEDED', command, result: { movement: saved.movement } };
  const response = await actor.call('/cash-movement-commands/resolution', 'POST', command);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.data).toEqual(expected);
  await f.close(shift.id, actor);
  const before = await f.detail(shift.id, actor);
  expect(await actor.expect('/cash-movement-commands/resolution', 'POST', command)).toEqual(
    expected,
  );
  const unknown = { ...command, requestKey: randomUUID() };
  expect(await actor.expect('/cash-movement-commands/resolution', 'POST', unknown)).toEqual({
    status: 'RETIRED',
    command: unknown,
  });
  expect(await actor.expect('/cash-movement-commands/resolution', 'POST', unknown)).toEqual({
    status: 'RETIRED',
    command: unknown,
  });
  const late = await actor.call(`/cash-shifts/${shift.id}/movements`, 'POST', {
    ...saved.body,
    requestKey: unknown.requestKey,
  });
  expect(late.status).toBe(409);
  expect(late.data.code).toBe('CASH_COMMAND_RETIRED');
  expect(await f.detail(shift.id, actor)).toEqual(before);
  expect((await f.list(shift.id)).movements).toHaveLength(2);
  expect(
    (await actor.call('/cash-movement-commands/resolution', 'POST', { ...command, amount: '7' }))
      .status,
  ).toBe(400);
  expect(
    (await actor.call('/cash-movement-commands/resolution', 'POST', command, {}, false)).status,
  ).toBe(403);
});

it('numerar recovery: familia CASH nu permite schimbarea kind/shift/actor, PAYMENT și CHECKOUT sunt independente', async () => {
  const actor = f.a.primary;
  const opened = await f.open(actor, '0');
  const path = `/cash-shifts/${opened.shift.id}/movements`;
  const reused = await actor.call(path, 'POST', f.body(1, { requestKey: opened.body.requestKey }));
  expect(reused.status).toBe(409);
  expect(reused.data.code).toBe('CASH_COMMAND_CONFLICT');
  const saved = await f.move(opened.shift.id, {}, actor);
  const command = {
    locationId: f.locationId,
    shiftId: opened.shift.id,
    requestKey: saved.body.requestKey,
    kind: 'CASH_IN',
  };
  expect(
    (await actor.call('/cash-commands/resolution', 'POST', { ...command, kind: 'CLOSE' })).status,
  ).toBe(409);
  expect(
    (
      await actor.call('/cash-movement-commands/resolution', 'POST', {
        ...command,
        kind: 'CASH_OUT',
      })
    ).status,
  ).toBe(409);
  const second = await f.open(actor, '0');
  expect(
    (
      await actor.call('/cash-movement-commands/resolution', 'POST', {
        ...command,
        shiftId: second.shift.id,
      })
    ).status,
  ).toBe(409);
  const other = f.movementActors.owner!.session;
  expect((await other.call('/cash-movement-commands/resolution', 'POST', command)).status).toBe(
    403,
  );
  const modern = await f.order();
  await actor.expect(`/orders/${modern.id}/payments`, 'POST', {
    version: modern.version,
    requestKey: saved.body.requestKey,
    cashShiftId: opened.shift.id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '1' }],
  });
  const manual = await f.order(true);
  await actor.expect(`/orders/${manual.id}/checkout/manual`, 'POST', {
    version: manual.version,
    requestKey: saved.body.requestKey,
    cashShiftId: opened.shift.id,
    confirmed: true,
    method: 'CARD',
  });
  expect(
    (await actor.expect('/cash-movement-commands/resolution', 'POST', command)).result.movement,
  ).toEqual(saved.movement);
});

it('numerar limite: suma exactă, rezoluția absentă și refuzul maxPercent în toate atribuțiile', async () => {
  const actor = f.movementActors.limited!.session;
  const { shift } = await f.open(actor, '100');
  const path = `/cash-shifts/${shift.id}/movements`;
  expect((await actor.call(path, 'POST', f.body(1, { amount: '10.01' }))).status).toBe(403);
  const saved = await f.move(shift.id, { amount: '10' }, actor);
  expect((await actor.expect(path, 'POST', saved.body)).movement).toEqual(saved.movement);
  const command = {
    locationId: f.locationId,
    shiftId: shift.id,
    requestKey: randomUUID(),
    kind: 'CASH_OUT',
  };
  expect((await actor.expect('/cash-movement-commands/resolution', 'POST', command)).status).toBe(
    'RETIRED',
  );
  const permission = { permission: 'cash.movements.create', limits: { maxPercent: '1' } };
  expect(
    (
      await f.a.primary.call('/roles', 'POST', {
        name: 'Numerar procent invalid',
        permissions: [permission],
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.a.primary.call(`/staff/${f.movementActors.reader!.userId}/overrides`, 'POST', {
        ...permission,
        effect: 'ALLOW',
        scopeType: 'LOCATION',
        locationId: f.locationId,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.a.primary.call('/delegations', 'POST', {
        userId: f.movementActors.reader!.userId,
        scopeType: 'LOCATION',
        locationId: f.locationId,
        permissions: [permission],
      })
    ).status,
  ).toBe(400);
});

it('numerar revocare: DENY actual refuză replay/resolver fără să piardă operația confirmată', async () => {
  const record = f.movementActors.owner!;
  const actor = await f.login(record);
  const { shift } = await f.open(actor, '0');
  const saved = await f.move(shift.id, {}, actor);
  const command = {
    locationId: f.locationId,
    shiftId: shift.id,
    requestKey: saved.body.requestKey,
    kind: 'CASH_IN',
  };
  const denied = await f.a.primary.expect(`/staff/${record.userId}/overrides`, 'POST', {
    permission: 'cash.movements.create',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.locationId,
  });
  const restricted = await f.login(record);
  expect(
    (await restricted.call(`/cash-shifts/${shift.id}/movements`, 'POST', saved.body)).status,
  ).toBe(403);
  expect(
    (await restricted.call('/cash-movement-commands/resolution', 'POST', command)).status,
  ).toBe(403);
  await f.a.primary.expect(`/staff/${record.userId}/overrides/${denied.override.id}`, 'DELETE', {});
  const restored = await f.login(record);
  expect(
    (await restored.expect('/cash-movement-commands/resolution', 'POST', command)).result.movement,
  ).toEqual(saved.movement);
  expect((await f.list(shift.id, restored)).movements).toHaveLength(2);
});

it('numerar plafon redus: replay și rezoluția verifică suma originală, nu corpul falsificat', async () =>
  verifyReducedMovementLimit(f));
