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

it('responsabilitate recovery: snapshoturile ASSIGN/PREPARE/ACCEPT rămân exacte după tranziții ulterioare', async () => {
  const outgoing = f.responsibilityActors.outgoing!.session;
  const incoming = f.responsibilityActors.incoming!.session;
  const { shift, register } = await f.open(outgoing, '0');
  const order = await f.order();
  const assigned = await f.assign(order.id, shift.id);
  const prepared = await f.prepare(order.id, shift.id);
  await f.close(shift.id, outgoing);
  const target = await f.openRegister(register.id, incoming);
  const accepted = await f.command(
    order.id,
    { kind: 'ACCEPT_HANDOFF', targetShiftId: target.id, handoffEventId: prepared.event.eventId },
    incoming,
  );
  const path = `/orders/${order.id}/responsibility-commands`;
  const records = [
    { actor: outgoing, saved: assigned, identity: { kind: 'ASSIGN', targetShiftId: shift.id } },
    {
      actor: outgoing,
      saved: prepared,
      identity: { kind: 'PREPARE_HANDOFF', sourceShiftId: shift.id },
    },
    {
      actor: incoming,
      saved: accepted,
      identity: {
        kind: 'ACCEPT_HANDOFF',
        targetShiftId: target.id,
        handoffEventId: prepared.event.eventId,
      },
    },
  ];
  for (const { actor, saved, identity } of records) {
    expect(await actor.expect(path, 'POST', saved.body)).toEqual({ event: saved.event });
    const command = { locationId: f.locationId, requestKey: saved.body.requestKey, ...identity };
    const response = await actor.call(`${path}/resolution`, 'POST', command);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.data).toEqual({
      status: 'SUCCEEDED',
      command: { ...command, orderId: order.id },
      result: { event: saved.event },
    });
    for (const changes of [
      { reason: 'Alt motiv operațional' },
      { orderVersion: order.version + 1 },
      { responsibilityVersion: 9 },
    ])
      expect((await actor.call(path, 'POST', { ...saved.body, ...changes })).status).toBe(409);
  }
  expect((await f.history(order.id)).events).toHaveLength(3);
  expect((await incoming.call(path, 'POST', assigned.body)).status).toBe(403);
  const alternate = await f.open(outgoing, '0');
  expect(
    (
      await outgoing.call(`${path}/resolution`, 'POST', {
        locationId: f.locationId,
        requestKey: assigned.body.requestKey,
        kind: 'ASSIGN',
        targetShiftId: alternate.shift.id,
      })
    ).status,
  ).toBe(409);
});

it('responsabilitate recovery: RETIRED este terminal înainte de fiecare writer și namespace-ul este independent de CASH', async () => {
  const actor = f.responsibilityActors.outgoing!.session;
  const opened = await f.open(actor, '0');
  const order = await f.order();
  const path = `/orders/${order.id}/responsibility-commands`;
  const command = {
    locationId: f.locationId,
    requestKey: opened.body.requestKey,
    kind: 'ASSIGN',
    targetShiftId: opened.shift.id,
  };
  expect(await actor.expect(`${path}/resolution`, 'POST', command)).toEqual({
    status: 'RETIRED',
    command: { ...command, orderId: order.id },
  });
  const body = {
    ...command,
    orderVersion: order.version,
    responsibilityVersion: 0,
    reason: 'Tentativa întârziată',
  };
  expect((await actor.call(path, 'POST', body)).status).toBe(409);
  expect((await f.history(order.id)).events).toEqual([]);
  const assigned = await f.assign(order.id, opened.shift.id);
  const prepareIdentity = {
    locationId: f.locationId,
    requestKey: randomUUID(),
    kind: 'PREPARE_HANDOFF',
    sourceShiftId: opened.shift.id,
  };
  expect((await actor.expect(`${path}/resolution`, 'POST', prepareIdentity)).status).toBe(
    'RETIRED',
  );
  expect(
    (
      await actor.call(path, 'POST', {
        ...prepareIdentity,
        orderVersion: order.version,
        responsibilityVersion: assigned.event.responsibilityVersion,
        reason: 'Predare întârziată',
      })
    ).status,
  ).toBe(409);
  expect((await f.current(order.id)).responsibility.state).toBe('ASSIGNED');
  const prepared = await f.prepare(order.id, opened.shift.id);
  await f.close(opened.shift.id, actor);
  const incoming = f.responsibilityActors.incoming!.session;
  const target = await f.openRegister(opened.register.id, incoming);
  const acceptIdentity = {
    locationId: f.locationId,
    requestKey: randomUUID(),
    kind: 'ACCEPT_HANDOFF',
    targetShiftId: target.id,
    handoffEventId: prepared.event.eventId,
  };
  expect((await incoming.expect(`${path}/resolution`, 'POST', acceptIdentity)).status).toBe(
    'RETIRED',
  );
  expect(
    (
      await incoming.call(path, 'POST', {
        ...acceptIdentity,
        orderVersion: order.version,
        responsibilityVersion: prepared.event.responsibilityVersion,
        reason: 'Acceptare întârziată',
      })
    ).status,
  ).toBe(409);
  expect((await f.current(order.id)).responsibility.state).toBe('PENDING_HANDOFF');
});

it('responsabilitate recovery: revocarea dreptului refuză reluarea fără să transforme succesul în retragere', async () => {
  const actor = await f.responsibilityLogin('outgoing');
  const record = f.responsibilityActors.outgoing!;
  const { shift } = await f.open(actor, '0');
  const order = await f.order();
  const saved = await f.assign(order.id, shift.id, actor);
  const path = `/orders/${order.id}/responsibility-commands`;
  const command = {
    locationId: f.locationId,
    kind: 'ASSIGN',
    targetShiftId: shift.id,
    requestKey: saved.body.requestKey,
  };
  const denied = await f.a.primary.expect(`/staff/${record.userId}/overrides`, 'POST', {
    permission: 'orders.handoff',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.locationId,
  });
  const revoked = await f.responsibilityLogin('outgoing');
  expect((await revoked.call(path, 'POST', saved.body)).status).toBe(403);
  expect((await revoked.call(`${path}/resolution`, 'POST', command)).status).toBe(403);
  await f.a.primary.expect(`/staff/${record.userId}/overrides/${denied.override.id}`, 'DELETE', {});
  const restored = await f.responsibilityLogin('outgoing');
  expect((await restored.expect(`${path}/resolution`, 'POST', command)).result.event).toEqual(
    saved.event,
  );
  expect((await f.history(order.id)).events).toHaveLength(1);
});
