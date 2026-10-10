import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareTables } from './api/tables-setup';
import type { TablesFixture } from './api/tables.types';
import { closeOperations } from './api/operations-setup';

let f: TablesFixture;
beforeAll(async () => {
  f = await prepareTables();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('vizită: OPEN, oaspeți și schimbare explicită de chelner păstrează actorii și snapshoturile', async () => {
  const { table } = await f.table({ name: 'Denumirea de la deschidere' });
  const opened = await f.open(table.id);
  const id = opened.event.result.id;
  expect(opened.event).toMatchObject({
    kind: 'OPEN',
    previousVersion: 0,
    previousGuestCount: null,
    previousWaiter: null,
    result: { guestCount: 2, waiter: { id: f.tableActors.waiter!.userId } },
  });
  const guests = await f.command(
    id,
    { kind: 'GUEST_COUNT_CHANGED', guestCount: 5 },
    f.tableActors.colleague!.session,
  );
  expect(guests.event).toMatchObject({
    previousVersion: 1,
    previousGuestCount: 2,
    actor: { id: f.tableActors.colleague!.userId },
    result: { version: 2, guestCount: 5 },
  });
  const body = {
    locationId: f.locationId,
    requestKey: randomUUID(),
    version: 2,
    kind: 'WAITER_CHANGED',
    targetWaiterUserId: f.tableActors.colleague!.userId,
    reason: 'Preluare explicită a servirii',
  };
  expect(
    (await f.tableActors.waiter!.session.call(`/table-visits/${id}/commands`, 'POST', body)).status,
  ).toBe(403);
  const changed = await f.tableActors.assigner!.session.expect(
    `/table-visits/${id}/commands`,
    'POST',
    body,
  );
  expect(changed.event).toMatchObject({
    actor: { id: f.tableActors.assigner!.userId },
    previousWaiter: { id: f.tableActors.waiter!.userId },
    result: { waiter: { id: f.tableActors.colleague!.userId } },
  });
  expect(
    (
      await f.tableActors.assigner!.session.call(`/table-visits/${id}/commands`, 'POST', {
        ...body,
        requestKey: randomUUID(),
        version: 3,
      })
    ).status,
  ).toBe(409);
  await f.a.primary.expect(`/dining-tables/${table.id}`, 'PATCH', {
    locationId: f.locationId,
    version: 1,
    requestKey: randomUUID(),
    name: 'Nume curent schimbat',
    capacity: 3,
    sortOrder: 1,
  });
  const closed = await f.close(id, f.tableActors.colleague!.session);
  expect(closed.event.result).toMatchObject({
    status: 'CLOSED',
    tableName: 'Denumirea de la deschidere',
    guestCount: 5,
    billRequested: false,
    billRequestedAt: null,
    billRequestEventId: null,
  });
  expect(closed.event.result.closedAt).toBe(closed.event.createdAt);
  expect((await f.history(id)).events).toHaveLength(4);
  expect(
    await f.tableActors.assigner!.session.expect(`/table-visits/${id}/commands`, 'POST', body),
  ).toEqual(changed);
});

it('vizită: o singură OPEN, versiunea stale și corpul strict nu lasă evenimente suplimentare', async () => {
  const { table } = await f.table();
  const attempts = await Promise.all(
    [1, 2].map(() =>
      f.tableActors.waiter!.session.call(`/dining-tables/${table.id}/visits`, 'POST', {
        locationId: f.locationId,
        requestKey: randomUUID(),
        guestCount: 2,
      }),
    ),
  );
  expect(attempts.map((r) => r.status).sort()).toEqual([200, 409]);
  const id = attempts.find((r) => r.status === 200)!.data.event.result.id;
  const body = {
    locationId: f.locationId,
    requestKey: randomUUID(),
    version: 1,
    kind: 'GUEST_COUNT_CHANGED',
    guestCount: 3,
  };
  await f.tableActors.waiter!.session.expect(`/table-visits/${id}/commands`, 'POST', body);
  expect(
    (
      await f.tableActors.waiter!.session.call(`/table-visits/${id}/commands`, 'POST', {
        ...body,
        requestKey: randomUUID(),
      })
    ).data.code,
  ).toBe('TABLE_VISIT_VERSION_CONFLICT');
  for (const change of [
    { guestCount: 0 },
    { guestCount: 1000 },
    { guestCount: 1.5 },
    { reason: 'Injecție' },
  ])
    expect(
      (
        await f.tableActors.waiter!.session.call(`/table-visits/${id}/commands`, 'POST', {
          ...body,
          version: 2,
          ...change,
        })
      ).status,
    ).toBe(400);
  expect((await f.history(id)).events).toHaveLength(2);
});

it('vizită: catalogul de chelneri este local și minimal, ținta dezactivată după citire este refuzată', async () => {
  const actor = f.tableActors.assigner!.session;
  const listed = await actor.expect(`/table-visit-waiters?locationId=${f.locationId}&limit=100`);
  const colleague = listed.waiters.find(
    (r: { id: string }) => r.id === f.tableActors.colleague!.userId,
  );
  expect(Object.keys(colleague).sort()).toEqual(['displayName', 'id']);
  expect(
    (await f.tableActors.reader!.session.call(`/table-visit-waiters?locationId=${f.locationId}`))
      .status,
  ).toBe(403);
  const { table } = await f.table();
  const opened = await f.open(table.id);
  const users = await f.a.primary.expect('/staff');
  const target = users.users.find((u: { id: string }) => u.id === colleague.id);
  await f.a.primary.expect(`/staff/${target.id}`, 'PATCH', {
    version: target.version,
    status: 'DISABLED',
  });
  const refreshed = await f.login('assigner');
  const rejected = await refreshed.call(
    `/table-visits/${opened.event.result.id}/commands`,
    'POST',
    {
      locationId: f.locationId,
      requestKey: randomUUID(),
      version: 1,
      kind: 'WAITER_CHANGED',
      targetWaiterUserId: colleague.id,
      reason: 'Ținta nu mai este activă',
    },
  );
  expect(rejected.status).toBe(409);
  expect(rejected.data.code).toBe('TABLE_WAITER_NOT_ELIGIBLE');
  expect((await f.visit(opened.event.result.id, f.a.primary)).visit.waiter.id).toBe(
    f.tableActors.waiter!.userId,
  );
});
