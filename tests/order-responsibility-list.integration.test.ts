import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOrderResponsibilities } from './api/order-responsibilities-setup';
import { closeOperations } from './api/operations-setup';
import type { ResponsibilityFixture } from './api/order-responsibilities.types';
import type { OrderResponsibilityListResponse } from '../packages/contracts/src/order-responsibilities';

let f: ResponsibilityFixture;
beforeAll(async () => {
  f = await prepareOrderResponsibilities();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('responsabilitate listă: paginare pe ultimul candidat scanat permite pagina goală și continuarea autorizată', async () => {
  const visible = await f.order(false, '5');
  for (let index = 0; index < 200; index++) await f.order(false, '20');
  const actor = f.responsibilityActors.limited!.session;
  const first: OrderResponsibilityListResponse = await f.queue({ limit: '1' }, actor);
  expect(first.orders).toEqual([]);
  expect(first.nextCursor).toBeTypeOf('string');
  expect(Object.keys(first).sort()).toEqual(['nextCursor', 'orders', 'timezone']);
  const second: OrderResponsibilityListResponse = await f.queue(
    { limit: '1', cursor: first.nextCursor! },
    actor,
  );
  expect(second.orders.map((row) => row.order.id)).toEqual([visible.id]);
  expect(second.nextCursor).toBeNull();
  expect(second.timezone).toBe('Europe/Chisinau');
  expect(second.orders[0]!.provenance).toEqual({ kind: 'NEVER_ASSIGNED', eventId: null });
  expect(second.orders[0]!.responsibility).toMatchObject({
    state: 'UNASSIGNED',
    version: 0,
    owner: null,
    shift: null,
  });
}, 120_000);

it('responsabilitate cursori: actor/view/perspectivă/tură/limit și istoricul au scope distinct', async () => {
  const actor = f.responsibilityActors.outgoing!.session;
  const incoming = f.responsibilityActors.incoming!.session;
  const opened = await f.open(actor, '0');
  const order = await f.order(false, '5');
  await f.assign(order.id, opened.shift.id);
  await f.prepare(order.id, opened.shift.id);
  const first: OrderResponsibilityListResponse = await f.queue({ limit: '1' }, actor);
  const cursor = first.nextCursor!;
  const query = (changes: Record<string, string> = {}) =>
    `/order-responsibilities?${new URLSearchParams({ locationId: f.locationId, view: 'UNASSIGNED', limit: '1', cursor, ...changes })}`;
  expect((await incoming.call(query())).status).toBe(400);
  const cursorChanges: Record<string, string>[] = [
    { limit: '2' },
    { view: 'ASSIGNED', shiftId: opened.shift.id },
    { view: 'PENDING', shiftId: opened.shift.id, perspective: 'OUTGOING' },
    { cursor: 'broken' },
  ];
  for (const changes of cursorChanges) expect((await actor.call(query(changes))).status).toBe(400);
  const history = await f.history(order.id, actor, '&limit=1');
  expect(history.events).toHaveLength(1);
  expect(history.nextCursor).toBeTypeOf('string');
  const next = await f.history(
    order.id,
    actor,
    `&limit=1&cursor=${encodeURIComponent(history.nextCursor)}`,
  );
  expect(next.events).toHaveLength(1);
  expect(next.nextCursor).toBeNull();
  expect(next.events[0].kind).toBe('ASSIGN');
  expect((await actor.call(query({ cursor: history.nextCursor }))).status).toBe(400);
  expect(
    (
      await actor.call(
        `/orders/${order.id}/responsibility-events?locationId=${f.locationId}&limit=1&cursor=${encodeURIComponent(cursor)}`,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await actor.call(
        `/order-responsibilities?locationId=${f.locationId}&view=PENDING&shiftId=${opened.shift.id}`,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await actor.call(
        `/order-responsibilities?locationId=${f.locationId}&view=UNASSIGNED&shiftId=${opened.shift.id}`,
      )
    ).status,
  ).toBe(400);
});

it('responsabilitate snapshot și acces: redenumirea păstrează proveniența, DENY recurent refuză paginarea', async () => {
  const actor = f.responsibilityActors.incoming!.session;
  const record = f.responsibilityActors.incoming!;
  const { shift, register } = await f.open(actor, '0');
  const orders = [await f.order(false, '5'), await f.order(false, '6')];
  for (const order of orders) await f.assign(order.id, shift.id, actor);
  const before = await f.current(orders[0].id, actor);
  await f.a.primary.expect(`/cash-registers/${register.id}`, 'PATCH', {
    locationId: f.locationId,
    version: 1,
    requestKey: randomUUID(),
    name: 'Registru redenumit după asumare',
  });
  expect((await f.current(orders[0].id, actor)).responsibility).toEqual(before.responsibility);
  const first = await f.queue({ view: 'ASSIGNED', shiftId: shift.id, limit: '1' }, actor);
  expect(first.orders).toHaveLength(1);
  expect(first.nextCursor).toBeTypeOf('string');
  await f.a.primary.expect(`/staff/${record.userId}/overrides`, 'POST', {
    permission: 'orders.read',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.locationId,
  });
  const revoked = await f.responsibilityLogin('incoming');
  const response = await revoked.call(
    `/order-responsibilities?${new URLSearchParams({ locationId: f.locationId, view: 'ASSIGNED', shiftId: shift.id, limit: '1', cursor: first.nextCursor })}`,
  );
  expect(response.status).toBe(403);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.data).not.toHaveProperty('orders');
});

it('responsabilitate cursor: schimbarea timezone invalidează pagina veche după reautentificare', async () => {
  const actor = await f.responsibilityLogin('outgoing');
  const first = await f.queue({ limit: '1' }, actor);
  expect(first.nextCursor).toBeTypeOf('string');
  const updated = await f.a.primary.expect(`/locations/${f.locationId}`, 'PATCH', {
    version: f.a.location.version,
    timezone: 'Europe/London',
  });
  const renewed = await f.responsibilityLogin('outgoing');
  const path = `/order-responsibilities?${new URLSearchParams({ locationId: f.locationId, view: 'UNASSIGNED', limit: '1', cursor: first.nextCursor })}`;
  expect((await renewed.call(path)).status).toBe(400);
  await f.a.primary.expect(`/locations/${f.locationId}`, 'PATCH', {
    version: updated.location.version,
    timezone: 'Europe/Chisinau',
  });
});
