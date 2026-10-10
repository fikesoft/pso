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
it('produse pentru rutare: căutare literală, paginare și acces fără prețuri', async () => {
  const base = `/kitchen-routing/products?locationId=${f.a.location.id}`;
  const page = await f.a.primary.expect(`${base}&limit=1`);
  expect(page.products).toHaveLength(1);
  expect(page.nextCursor).toBe(page.products[0].id);
  expect(page.products[0]).not.toHaveProperty('price');
  expect(page.products[0]).not.toHaveProperty('cost');
  const next = await f.a.primary.expect(`${base}&limit=1&cursor=${page.nextCursor}`);
  expect(next.products).toHaveLength(1);
  expect(next.products[0].id).not.toBe(page.products[0].id);
  expect(next.nextCursor).toBeNull();
  const searched = await f.a.primary.expect(`${base}&search=cafea`);
  expect(searched.products.map((product: { id: string }) => product.id)).toEqual([f.product.id]);
  expect((await f.a.primary.expect(`${base}&search=%25`)).products).toEqual([]);
  expect((await f.cook.call(base)).status).toBe(403);
  expect((await f.b.primary.call(base)).status).toBe(403);
  expect(
    (
      await f.b.primary.call(
        `/kitchen-routing/products?locationId=${f.b.location.id}&cursor=${f.product.id}`,
      )
    ).status,
  ).toBe(400);
  expect(
    (await f.a.primary.expect(`/kitchen-routing/products?locationId=${f.otherLocation.id}`))
      .products,
  ).toEqual([]);
});
it('rutare: versiuni, replay istoric, anularea atribuirii și recuperare terminală', async () => {
  const locationId = f.a.location.id;
  const productId = f.product.id;
  const path = `/kitchen-routing?locationId=${locationId}&productId=${productId}`;
  expect((await f.a.primary.expect(path)).routing).toEqual({
    locationId,
    productId,
    version: 0,
    station: null,
  });
  const { station } = await f.a.primary.expect('/kitchen-stations', 'POST', {
    locationId,
    requestKey: randomUUID(),
    code: 'BAR',
    name: 'Bar inițial',
    sortOrder: 1,
  });
  const body = {
    locationId,
    productId,
    version: 0,
    stationId: station.id,
    requestKey: randomUUID(),
  };
  const first = await f.a.primary.expect('/kitchen-routing', 'PUT', body);
  expect(first.routing).toEqual({
    locationId,
    productId,
    version: 1,
    station: { id: station.id, code: 'BAR', name: 'Bar inițial' },
  });
  await f.a.primary.expect(`/kitchen-stations/${station.id}`, 'PATCH', {
    locationId,
    requestKey: randomUUID(),
    version: 1,
    name: 'Bar redenumit',
    sortOrder: 2,
  });
  expect(await f.a.primary.expect('/kitchen-routing', 'PUT', body)).toEqual(first);
  expect(
    (await f.a.primary.call('/kitchen-routing', 'PUT', { ...body, stationId: null })).status,
  ).toBe(409);
  expect(
    (await f.a.primary.call('/kitchen-routing', 'PUT', { ...body, requestKey: randomUUID() }))
      .status,
  ).toBe(409);
  const identity = { locationId, productId, requestKey: body.requestKey };
  expect(
    await f.a.primary.expect('/kitchen-routing-commands/resolution', 'POST', identity),
  ).toEqual({ status: 'SUCCEEDED', command: identity, result: first });
  const cleared = await f.a.primary.expect('/kitchen-routing', 'PUT', {
    ...body,
    version: 1,
    stationId: null,
    requestKey: randomUUID(),
  });
  expect(cleared.routing).toMatchObject({ version: 2, station: null });
  expect(await f.a.primary.expect(path)).toEqual(cleared);
  const retired = { locationId, productId, requestKey: randomUUID() };
  expect(await f.a.primary.expect('/kitchen-routing-commands/resolution', 'POST', retired)).toEqual(
    { status: 'RETIRED', command: retired },
  );
  expect(
    (await f.a.primary.call('/kitchen-routing', 'PUT', { ...body, ...retired, version: 2 })).status,
  ).toBe(409);
});
it('rutare: permisiuni, locație, tenant și stații arhivate', async () => {
  const locationId = f.a.location.id;
  const productId = f.secondProduct.id;
  const { station } = await f.a.primary.expect('/kitchen-stations', 'POST', {
    locationId,
    requestKey: randomUUID(),
    code: 'GRILL',
    name: 'Grătar',
    sortOrder: 1,
  });
  const body = {
    locationId,
    productId,
    version: 0,
    stationId: station.id,
    requestKey: randomUUID(),
  };
  expect((await f.cook.call('/kitchen-routing', 'PUT', body)).status).toBe(403);
  expect((await f.b.primary.call('/kitchen-routing', 'PUT', body)).status).toBe(403);
  expect(
    (await f.a.primary.call('/kitchen-routing', 'PUT', { ...body, locationId: f.otherLocation.id }))
      .status,
  ).toBe(404);
  await f.a.primary.expect(`/kitchen-stations/${station.id}/archive`, 'POST', {
    locationId,
    requestKey: randomUUID(),
    version: 1,
  });
  expect((await f.a.primary.call('/kitchen-routing', 'PUT', body)).status).toBe(409);
  const path = `/kitchen-routing?locationId=${locationId}&productId=${productId}`;
  expect((await f.cook.expect(path)).routing.version).toBe(0);
});
