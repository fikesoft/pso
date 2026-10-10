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

it('mese CRUD: normalizare, versiuni, arhivare și replay păstrează snapshoturile originale', async () => {
  const created = await f.table({ code: '  masa_1  ', name: '  Masa de lângă fereastră  ' });
  expect(created.table).toMatchObject({
    code: 'MASA_1',
    name: 'Masa de lângă fereastră',
    version: 1,
  });
  const path = `/dining-tables/${created.table.id}`;
  const body = {
    locationId: f.locationId,
    requestKey: randomUUID(),
    version: 1,
    name: 'Masa nouă',
    capacity: 6,
    sortOrder: 1,
  };
  const updated = await f.a.primary.expect(path, 'PATCH', body);
  expect(updated.table).toMatchObject({ version: 2, capacity: 6, sortOrder: 1 });
  expect(
    (await f.a.primary.call(path, 'PATCH', { ...body, requestKey: randomUUID() })).status,
  ).toBe(409);
  expect(
    (await f.a.primary.call(path, 'PATCH', { ...body, version: 2, code: 'ALTERAT' })).status,
  ).toBe(400);
  const archive = { locationId: f.locationId, requestKey: randomUUID(), version: 2 };
  const archived = await f.a.primary.expect(`${path}/archive`, 'POST', archive);
  expect(archived.table.status).toBe('ARCHIVED');
  expect(await f.a.primary.expect('/dining-tables', 'POST', created.body)).toEqual({
    table: created.table,
  });
  expect(await f.a.primary.expect(path, 'PATCH', body)).toEqual(updated);
  expect(await f.a.primary.expect(`${path}/archive`, 'POST', archive)).toEqual(archived);
  const duplicate = await f.a.primary.call('/dining-tables', 'POST', {
    ...created.body,
    requestKey: randomUUID(),
  });
  expect(duplicate.status).toBe(409);
  expect(duplicate.data.code).toBe('DINING_TABLE_CODE_EXISTS');
  expect(
    (await f.map()).tables.map((row: { table: { id: string } }) => row.table.id),
  ).not.toContain(created.table.id);
  const listed = await f.a.primary.expect(
    `/dining-tables?locationId=${f.locationId}&status=ARCHIVED`,
  );
  expect(listed.tables.map((row: { id: string }) => row.id)).toContain(created.table.id);
});

it('mese gard: vizita OPEN blochează arhivarea fără date ascunse, iar guestCount nu este limitat de capacity', async () => {
  const { table } = await f.table({ capacity: 1 });
  const opened = await f.open(table.id, undefined, { guestCount: 999 });
  expect(opened.event.result.guestCount).toBe(999);
  const rejected = await f.a.primary.call(`/dining-tables/${table.id}/archive`, 'POST', {
    locationId: f.locationId,
    requestKey: randomUUID(),
    version: 1,
  });
  expect(rejected.status).toBe(409);
  expect(rejected.data.code).toBe('TABLE_HAS_OPEN_VISIT');
  expect(JSON.stringify(rejected.data)).not.toMatch(/guestCount|waiter|orderId|total|count"/);
  await f.close(opened.event.result.id);
  await f.a.primary.expect(`/dining-tables/${table.id}/archive`, 'POST', {
    locationId: f.locationId,
    requestKey: randomUUID(),
    version: 1,
  });
  expect(
    (
      await f.tableActors.waiter!.session.call(`/dining-tables/${table.id}/visits`, 'POST', {
        locationId: f.locationId,
        requestKey: randomUUID(),
        guestCount: 1,
      })
    ).status,
  ).toBe(409);
});

it('mese input: limitele, CSRF, Origin și headerul de idempotency sunt evaluate separat', async () => {
  for (const change of [
    { capacity: 0 },
    { capacity: 1000 },
    { sortOrder: -1 },
    { sortOrder: 100001 },
    { code: 'M A' },
    { name: '' },
    { waiterUserId: randomUUID() },
  ])
    expect((await f.a.primary.call('/dining-tables', 'POST', f.tableBody(change))).status).toBe(
      400,
    );
  const body = f.tableBody();
  expect((await f.a.primary.call('/dining-tables', 'POST', body, {}, false)).status).toBe(403);
  expect(
    (await f.a.primary.call('/dining-tables', 'POST', body, { origin: 'https://invalid.example' }))
      .status,
  ).toBe(403);
  expect(
    (await f.a.primary.call('/dining-tables', 'POST', body, { 'idempotency-key': randomUUID() }))
      .status,
  ).toBe(400);
  const result = await f.a.primary.call('/dining-tables', 'POST', body);
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toContain('no-store');
});

it('mese acces: citirea nu acordă administrare, iar MFA este cerut înainte de configurare', async () => {
  const actor = f.tableActors.administrator!.session;
  const body = f.tableBody();
  expect((await actor.call('/dining-tables', 'POST', body)).status).toBe(403);
  await actor.enroll();
  await actor.expect('/dining-tables', 'POST', body);
  expect(
    (await f.tableActors.waiter!.session.call('/dining-tables', 'POST', f.tableBody())).status,
  ).toBe(403);
  const { table } = await f.table();
  const foreign = await f.b.primary.call(`/dining-tables/${table.id}/archive`, 'POST', {
    locationId: f.b.location.id,
    requestKey: randomUUID(),
    version: 1,
  });
  expect(foreign.status).toBe(404);
  expect(
    (
      await f.a.primary.call(`/dining-tables/${table.id}/archive`, 'POST', {
        locationId: f.otherLocation.id,
        requestKey: randomUUID(),
        version: 1,
      })
    ).status,
  ).toBe(404);
  const rows = (await f.map()).tables;
  expect(rows.every((row: { actions: { open: boolean } }) => !row.actions.open)).toBe(true);
});
