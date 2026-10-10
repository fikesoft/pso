import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
let f: Awaited<ReturnType<typeof prepareOperations>>;
beforeAll(async () => {
  f = await prepareOperations();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
function body() {
  return {
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    code: `S-${randomUUID().slice(0, 8).toUpperCase()}`,
    name: 'Stație sintetică',
    sortOrder: 10,
  };
}
it('stații: creare, modificare, arhivare și recuperare cu rezultate istorice exacte', async () => {
  const create = body();
  const first = await f.a.primary.expect('/kitchen-stations', 'POST', create);
  expect(first.station.version).toBe(1);
  const id = first.station.id;
  const update = {
    locationId: create.locationId,
    requestKey: randomUUID(),
    version: 1,
    name: 'Stație redenumită',
    sortOrder: 20,
  };
  const second = await f.a.primary.expect(`/kitchen-stations/${id}`, 'PATCH', update);
  expect(second.station).toMatchObject({ version: 2, name: update.name, code: create.code });
  expect(await f.a.primary.expect('/kitchen-stations', 'POST', create)).toEqual(first);
  expect(await f.a.primary.expect(`/kitchen-stations/${id}`, 'PATCH', update)).toEqual(second);
  expect(
    (
      await f.a.primary.call(`/kitchen-stations/${id}`, 'PATCH', {
        ...update,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  expect(
    (await f.a.primary.call('/kitchen-stations', 'POST', { ...create, name: 'Alte date' })).status,
  ).toBe(409);
  const identity = {
    locationId: create.locationId,
    requestKey: update.requestKey,
    kind: 'UPDATE',
    stationId: id,
  };
  expect(
    await f.a.primary.expect('/kitchen-station-commands/resolution', 'POST', identity),
  ).toEqual({ status: 'SUCCEEDED', command: identity, result: second });
  const archived = await f.a.primary.expect(`/kitchen-stations/${id}/archive`, 'POST', {
    locationId: create.locationId,
    requestKey: randomUUID(),
    version: 2,
  });
  expect(archived.station).toMatchObject({ status: 'ARCHIVED', version: 3 });
  expect(
    (
      await f.a.primary.call(`/kitchen-stations/${id}`, 'PATCH', {
        ...update,
        requestKey: randomUUID(),
        version: 3,
      })
    ).status,
  ).toBe(409);
  expect(
    (await f.a.primary.expect(`/kitchen-stations?locationId=${create.locationId}&status=ARCHIVED`))
      .stations,
  ).toContainEqual(archived.station);
});
it('stații: separă citirea de administrare, izolează locațiile și leagă cursorul de context', async () => {
  const one = body();
  const result = await f.a.primary.expect('/kitchen-stations', 'POST', one);
  await f.a.primary.expect('/kitchen-stations', 'POST', body());
  const list = await f.cook.expect(`/kitchen-stations?locationId=${one.locationId}&limit=1`);
  expect(list.stations).toHaveLength(1);
  expect(list.nextCursor).toBeTruthy();
  const next = await f.cook.expect(
    `/kitchen-stations?locationId=${one.locationId}&limit=1&cursor=${encodeURIComponent(list.nextCursor)}`,
  );
  expect(next.stations[0].id).not.toBe(list.stations[0].id);
  expect(
    (
      await f.a.primary.call(
        `/kitchen-stations?locationId=${one.locationId}&cursor=${encodeURIComponent(list.nextCursor)}`,
      )
    ).status,
  ).toBe(400);
  expect((await f.cook.call('/kitchen-stations', 'POST', body())).status).toBe(403);
  expect(
    (await f.cook.call(`/kitchen-stations?locationId=${one.locationId}&status=ARCHIVED`)).status,
  ).toBe(403);
  expect((await f.cook.call(`/kitchen-stations?locationId=${f.otherLocation.id}`)).status).toBe(
    403,
  );
  expect((await f.manager.call(`/kitchen-stations?locationId=${one.locationId}`)).status).toBe(403);
  expect(
    (
      await f.b.primary.call(`/kitchen-stations/${result.station.id}/archive`, 'POST', {
        locationId: f.b.location.id,
        requestKey: randomUUID(),
        version: 1,
      })
    ).status,
  ).toBe(404);
  expect(
    (await f.a.primary.call('/kitchen-stations', 'POST', { ...one, requestKey: randomUUID() }))
      .status,
  ).toBe(409);
  expect(
    (
      await f.a.primary.expect('/kitchen-stations', 'POST', {
        ...one,
        locationId: f.otherLocation.id,
        requestKey: randomUUID(),
      })
    ).station.locationId,
  ).toBe(f.otherLocation.id);
});
it('stații: retragerea unei tentative neexecutate blochează cererile întârziate', async () => {
  const create = body();
  const identity = { locationId: create.locationId, requestKey: create.requestKey, kind: 'CREATE' };
  const resolve = '/kitchen-station-commands/resolution';
  expect(await f.a.primary.expect(resolve, 'POST', identity)).toEqual({
    status: 'RETIRED',
    command: identity,
  });
  expect((await f.a.primary.call('/kitchen-stations', 'POST', create)).status).toBe(409);
  const { station } = await f.a.primary.expect('/kitchen-stations', 'POST', {
    ...create,
    requestKey: randomUUID(),
  });
  const update = {
    locationId: create.locationId,
    requestKey: randomUUID(),
    version: 1,
    name: 'Modificare întârziată',
    sortOrder: 30,
  };
  await f.a.primary.expect(resolve, 'POST', {
    kind: 'UPDATE',
    stationId: station.id,
    locationId: update.locationId,
    requestKey: update.requestKey,
  });
  expect((await f.a.primary.call(`/kitchen-stations/${station.id}`, 'PATCH', update)).status).toBe(
    409,
  );
  const rows = (await f.a.primary.expect(`/kitchen-stations?locationId=${create.locationId}`))
    .stations;
  expect(rows.find((row: { id: string }) => row.id === station.id)).toEqual(station);
});
