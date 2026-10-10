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

it('responsabilitate: ASSIGN→PREPARE→CLOSE→OPEN→ACCEPT păstrează ownerul nominal și versiunea comercială', async () => {
  const outgoing = f.responsibilityActors.outgoing!.session;
  const incoming = f.responsibilityActors.incoming!.session;
  const { shift, register } = await f.open(outgoing, '0');
  const order = await f.order();
  const before = await f.a.primary.expect(`/orders/${order.id}`);
  const unassigned = await f.current(order.id, outgoing);
  expect(unassigned.responsibility).toMatchObject({
    state: 'UNASSIGNED',
    version: 0,
    owner: null,
    shift: null,
  });
  expect((await f.history(order.id)).events).toEqual([]);
  const assigned = await f.assign(order.id, shift.id);
  expect(assigned.event).toMatchObject({
    commandKind: 'ASSIGN',
    actorUserId: f.responsibilityActors.outgoing!.userId,
    resultState: 'ASSIGNED',
    orderVersion: order.version,
    responsibilityVersion: 1,
  });
  expect((await f.current(order.id, outgoing)).responsibility).toMatchObject({
    state: 'ASSIGNED',
    version: 1,
    owner: { userId: f.responsibilityActors.outgoing!.userId },
    shift: { id: shift.id },
  });
  expect(await f.a.primary.expect(`/orders/${order.id}`)).toEqual(before);
  expect((await f.detail(shift.id, outgoing)).shift.version).toBe(1);
  const refused = await outgoing.call(`/cash-shifts/${shift.id}/close`, 'POST', {
    locationId: f.locationId,
    requestKey: randomUUID(),
    version: 1,
    countedCash: '0',
  });
  expect(refused.status).toBe(409);
  expect(refused.data.code).toBe('CASH_SHIFT_UNRESOLVED_ORDERS');
  for (const value of [order.id, String(order.number), order.total])
    expect(JSON.stringify(refused.data)).not.toContain(value);
  const prepared = await f.prepare(order.id, shift.id);
  expect((await f.current(order.id)).responsibility).toMatchObject({
    state: 'PENDING_HANDOFF',
    owner: { userId: f.responsibilityActors.outgoing!.userId },
    shift: { id: shift.id },
    pendingEventId: prepared.event.eventId,
  });
  await f.close(shift.id, outgoing);
  const archived = await f.a.primary.call(`/cash-registers/${register.id}/archive`, 'POST', {
    locationId: f.locationId,
    version: 1,
    requestKey: randomUUID(),
  });
  expect(archived.status).toBe(409);
  expect(archived.data.code).toBe('CASH_REGISTER_PENDING_HANDOFF');
  expect(JSON.stringify(archived.data)).not.toContain(order.id);
  const target = await f.openRegister(register.id, incoming);
  expect(
    (
      await f.queue({ view: 'PENDING', perspective: 'INCOMING', shiftId: target.id }, incoming)
    ).orders.map((row: { order: { id: string } }) => row.order.id),
  ).toContain(order.id);
  const accepted = await f.command(
    order.id,
    { kind: 'ACCEPT_HANDOFF', handoffEventId: prepared.event.eventId, targetShiftId: target.id },
    incoming,
  );
  expect(accepted.event).toMatchObject({
    commandKind: 'ACCEPT_HANDOFF',
    actorUserId: f.responsibilityActors.incoming!.userId,
    resultState: 'ASSIGNED',
    responsibilityVersion: 3,
  });
  expect((await f.current(order.id)).responsibility).toMatchObject({
    owner: { userId: f.responsibilityActors.incoming!.userId },
    shift: { id: target.id },
    pendingEventId: null,
  });
  expect((await f.history(order.id)).events.map((event: { kind: string }) => event.kind)).toEqual([
    'ACCEPT_HANDOFF',
    'PREPARE_HANDOFF',
    'ASSIGN',
  ]);
  expect(await f.a.primary.expect(`/orders/${order.id}`)).toEqual(before);
  expect((await f.detail(target.id, incoming)).shift.version).toBe(1);
});

it('responsabilitate: predarea incoming neacceptată nu blochează CLOSE și nu obligă asumarea', async () => {
  const outgoing = f.responsibilityActors.outgoing!.session;
  const incoming = f.responsibilityActors.incoming!.session;
  const { shift, register } = await f.open(outgoing, '0');
  const order = await f.order();
  await f.assign(order.id, shift.id);
  const prepared = await f.prepare(order.id, shift.id);
  await f.close(shift.id, outgoing);
  const skipped = await f.openRegister(register.id, incoming);
  await f.close(skipped.id, incoming);
  expect((await f.current(order.id)).responsibility.pendingEventId).toBe(prepared.event.eventId);
  const later = await f.openRegister(register.id, incoming);
  await f.command(
    order.id,
    { kind: 'ACCEPT_HANDOFF', targetShiftId: later.id, handoffEventId: prepared.event.eventId },
    incoming,
  );
  expect((await f.current(order.id)).responsibility.shift.id).toBe(later.id);
});

it('responsabilitate: versiuni/ținte/scheme greșite nu creează efecte, iar confirmarea fără asumare rămâne legală', async () => {
  const actor = f.responsibilityActors.outgoing!.session;
  const { shift } = await f.open(actor, '0');
  const other = await f.open(f.responsibilityActors.incoming!.session, '0');
  const order = await f.order();
  const path = `/orders/${order.id}/responsibility-commands`;
  const body = {
    locationId: f.locationId,
    kind: 'ASSIGN',
    targetShiftId: shift.id,
    orderVersion: order.version,
    responsibilityVersion: 0,
    requestKey: randomUUID(),
    reason: 'Asumare explicită',
  };
  for (const changes of [{ orderVersion: order.version + 1 }, { responsibilityVersion: 1 }])
    expect((await actor.call(path, 'POST', { ...body, ...changes })).status).toBe(409);
  expect((await actor.call(path, 'POST', { ...body, targetShiftId: other.shift.id })).status).toBe(
    403,
  );
  for (const changes of [
    { ownerUserId: randomUUID() },
    { reason: 'ab' },
    { reason: 'x'.repeat(501) },
    { targetRegisterId: randomUUID() },
  ])
    expect((await actor.call(path, 'POST', { ...body, ...changes })).status).toBe(400);
  expect((await f.history(order.id)).events).toEqual([]);
  await f.close(shift.id, actor);
  expect((await actor.call(path, 'POST', body)).status).toBe(409);
  expect((await f.current(order.id)).responsibility.version).toBe(0);
});

it('responsabilitate acceptare: alt registru și evenimentul de predare vechi nu pot schimba ownerul', async () => {
  const outgoing = f.responsibilityActors.outgoing!.session;
  const incoming = f.responsibilityActors.incoming!.session;
  const source = await f.open(outgoing, '0');
  const order = await f.order();
  await f.assign(order.id, source.shift.id);
  const first = await f.prepare(order.id, source.shift.id);
  await f.close(source.shift.id, outgoing);
  const wrong = await f.open(incoming, '0');
  const path = `/orders/${order.id}/responsibility-commands`;
  const body = {
    locationId: f.locationId,
    kind: 'ACCEPT_HANDOFF',
    targetShiftId: wrong.shift.id,
    handoffEventId: first.event.eventId,
    orderVersion: order.version,
    responsibilityVersion: 2,
    requestKey: randomUUID(),
    reason: 'Acceptare explicită pe destinație',
  };
  expect((await incoming.call(path, 'POST', body)).status).toBe(409);
  const target = await f.openRegister(source.register.id, incoming);
  await f.command(
    order.id,
    { kind: 'ACCEPT_HANDOFF', targetShiftId: target.id, handoffEventId: first.event.eventId },
    incoming,
  );
  const second = await f.prepare(order.id, target.id, incoming);
  await f.close(target.id, incoming);
  const next = await f.openRegister(source.register.id, outgoing);
  const stale = await outgoing.call(path, 'POST', {
    ...body,
    requestKey: randomUUID(),
    targetShiftId: next.id,
    responsibilityVersion: second.event.responsibilityVersion,
  });
  expect(stale.status).toBe(409);
  expect((await f.current(order.id)).responsibility.pendingEventId).toBe(second.event.eventId);
  expect((await f.history(order.id)).events).toHaveLength(4);
});

it('responsabilitate acceptare: ținta explicită depășește prima tură nepotrivită și păstrează ambele snapshoturi de registru', async () => {
  const outgoing = f.responsibilityActors.outgoing!.session;
  const incoming = f.responsibilityActors.incoming!.session;
  const source = await f.open(outgoing, '0');
  const order = await f.order();
  await f.assign(order.id, source.shift.id);
  const prepared = await f.prepare(order.id, source.shift.id);
  await f.close(source.shift.id, outgoing);
  const wrong = await f.open(incoming, '0');
  await f.a.primary.expect(`/cash-registers/${source.register.id}`, 'PATCH', {
    locationId: f.locationId,
    version: 1,
    requestKey: randomUUID(),
    name: 'Denumire nouă înaintea turei incoming',
  });
  const target = await f.openRegister(source.register.id, incoming);
  expect(
    (await f.queue({ view: 'PENDING', perspective: 'INCOMING', shiftId: wrong.shift.id }, incoming))
      .orders,
  ).toEqual([]);
  const correct = await f.queue(
    { view: 'PENDING', perspective: 'INCOMING', shiftId: target.id },
    incoming,
  );
  expect(
    correct.orders.find((row: { order: { id: string } }) => row.order.id === order.id).actions
      .accept,
  ).toBe(true);
  const accepted = await f.command(
    order.id,
    { kind: 'ACCEPT_HANDOFF', targetShiftId: target.id, handoffEventId: prepared.event.eventId },
    incoming,
  );
  expect(accepted.event.sourceShift).toMatchObject({
    id: source.shift.id,
    registerName: source.shift.registerName,
  });
  expect(accepted.event.targetShift).toMatchObject({
    id: target.id,
    registerName: 'Denumire nouă înaintea turei incoming',
  });
  await f.a.primary.expect(`/cash-registers/${source.register.id}`, 'PATCH', {
    locationId: f.locationId,
    version: 2,
    requestKey: randomUUID(),
    name: 'Denumire schimbată după acceptare',
  });
  expect(
    await incoming.expect(`/orders/${order.id}/responsibility-commands`, 'POST', accepted.body),
  ).toEqual({ event: accepted.event });
  const identity = {
    locationId: f.locationId,
    requestKey: accepted.body.requestKey,
    kind: 'ACCEPT_HANDOFF',
    targetShiftId: target.id,
    handoffEventId: prepared.event.eventId,
  };
  expect(
    (
      await incoming.expect(
        `/orders/${order.id}/responsibility-commands/resolution`,
        'POST',
        identity,
      )
    ).result.event,
  ).toEqual(accepted.event);
});
