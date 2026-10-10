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
it('previzualizarea explică regula efectivă și moștenirea fără a acorda scope organizațional', async () => {
  const category = {
    scope: { scopeType: 'ORGANIZATION' },
    target: { kind: 'CATEGORY', categoryId: f.category.id },
  };
  const product = {
    scope: { scopeType: 'LOCATION', locationId: f.a.location.id },
    target: { kind: 'PRODUCT', productId: f.product.id },
  };
  await f.a.primary.expect('/kitchen-alerts', 'PUT', {
    ...category,
    version: 0,
    requestKey: randomUUID(),
    thresholds: { warningSeconds: 20, criticalSeconds: 40 },
  });
  await f.a.primary.expect('/kitchen-alerts', 'PUT', {
    ...product,
    version: 0,
    requestKey: randomUUID(),
    thresholds: { warningSeconds: 10, criticalSeconds: 30 },
  });
  const preview = await f.a.primary.expect('/kitchen-alerts/preview', 'POST', product);
  expect(preview).toEqual({
    effective: { thresholds: { warningSeconds: 10, criticalSeconds: 30 }, source: product },
    inherited: { thresholds: { warningSeconds: 20, criticalSeconds: 40 }, source: category },
  });
  expect((await f.cook.call('/kitchen-alerts/preview', 'POST', product)).status).toBe(403);
  expect((await f.b.primary.call('/kitchen-alerts/preview', 'POST', category)).status).toBe(404);
});
it('opțiunile sunt paginate, minimale și izolate pentru scope și tip', async () => {
  const body = {
    scope: { scopeType: 'LOCATION', locationId: f.a.location.id },
    kind: 'PRODUCT',
    limit: 1,
  };
  const first = await f.a.primary.expect('/kitchen-alerts/options', 'POST', body);
  expect(first.options).toHaveLength(1);
  expect(Object.keys(first.options[0]).sort()).toEqual(['code', 'id', 'name']);
  expect(first.nextCursor).toBeTruthy();
  const second = await f.a.primary.expect('/kitchen-alerts/options', 'POST', {
    ...body,
    cursor: first.nextCursor,
  });
  expect(second.options).toHaveLength(1);
  expect(second.options[0].id).not.toBe(first.options[0].id);
  expect(second.nextCursor).toBeNull();
  expect(
    (await f.a.primary.expect('/kitchen-alerts/options', 'POST', { ...body, search: 'CAFEA' }))
      .options[0].id,
  ).toBe(f.product.id);
  expect(
    (
      await f.a.primary.expect('/kitchen-alerts/options', 'POST', {
        ...body,
        scope: { scopeType: 'LOCATION', locationId: f.otherLocation.id },
      })
    ).options,
  ).toEqual([]);
  expect((await f.cook.call('/kitchen-alerts/options', 'POST', body)).status).toBe(403);
  expect(
    (
      await f.a.primary.call('/kitchen-alerts/options', 'POST', {
        ...body,
        scope: { scopeType: 'ORGANIZATION' },
        kind: 'STATION',
      })
    ).status,
  ).toBe(400);
});
