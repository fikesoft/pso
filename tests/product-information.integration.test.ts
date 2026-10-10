import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations, prepareOperations } from './api/operations-setup';
import { bases, db, fixturePasswords } from './api/support/harness';
import type { OperationsFixture } from './api/operations.types';

let f: OperationsFixture;
beforeAll(async () => {
  f = await prepareOperations();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('administers nutrition and declared lists with tenant scope, version conflicts, audit and website exposure', async () => {
  const { a, b, manager, worker, product } = f;
  expect(product.calories).toBeNull();
  expect(product.allergens).toBeNull();
  expect(product.ingredients).toBeNull();
  const path = `/catalog/products/${product.id}`;
  const values = {
    calories: '120.125',
    protein: '10.005',
    fat: '0',
    carbs: null,
    nutritionBasis: 'PER_100G',
    allergens: ['MILK', 'GLUTEN'],
    ingredients: ['Lapte', 'Cafea'],
  };
  const body = { ...values, version: product.version };
  expect((await manager.call(path, 'PATCH', body)).status).toBe(403);
  expect((await b.primary.call(path, 'PATCH', body)).status).toBe(404);
  for (const invalid of [
    { calories: '-1' },
    { protein: 5 },
    { carbs: '1.0001' },
    { fat: 'NaN' },
    { nutritionBasis: 'unknown' },
    { allergens: ['MILK', 'milk'] },
    { ingredients: [''] },
    { allergensDeclared: true },
  ])
    expect((await a.primary.call(path, 'PATCH', { ...body, ...invalid })).status).toBe(400);
  const writes = await Promise.all([
    a.primary.call(path, 'PATCH', body),
    a.primary.call(path, 'PATCH', { ...body, protein: '11.005' }),
  ]);
  expect(writes.map((result) => result.status).sort()).toEqual([200, 409]);
  const saved = writes.find((result) => result.status === 200)!.data.product;
  expect(saved).toMatchObject({ ...values, fat: '0.000', protein: saved.protein });
  const read = async () => (await worker.expect(`${path}?locationId=${a.location.id}`)).product;
  expect(await read()).toMatchObject(saved);
  expect((await read()).price).toBe(product.price);
  const renamed = (
    await a.primary.expect(path, 'PATCH', { version: saved.version, name: 'Cafea declarată' })
  ).product;
  expect(renamed.allergens).toEqual(values.allergens);
  expect(renamed.protein).toBe(saved.protein);
  const connection = (
    await a.primary.expect('/website/connections', 'POST', {
      locationId: a.location.id,
      name: 'Nutriție locală',
    })
  ).connection;
  const issued = await a.primary.expect(`/website/connections/${connection.id}/keys`, 'POST', {
    name: 'Cheie nutriție locală',
  });
  fixturePasswords.add(issued.apiKey);
  const response = await fetch(`${bases.TENANT}/api/integrations/catalog`, {
    headers: { authorization: `Bearer ${issued.apiKey}` },
  });
  expect(response.status).toBe(200);
  const exposed = (await response.json()).products.find(
    (row: { productId: string }) => row.productId === product.id,
  );
  expect(exposed).toMatchObject({ ...values, protein: saved.protein, fat: '0.000' });
  const zero = (
    await a.primary.expect(path, 'PATCH', {
      version: renamed.version,
      calories: '0',
      allergens: [],
      ingredients: null,
    })
  ).product;
  expect(zero.calories).toBe('0.000');
  expect(zero.allergens).toEqual([]);
  expect(zero.ingredients).toBeNull();
  const cleared = (
    await a.primary.expect(path, 'PATCH', {
      version: zero.version,
      calories: null,
      allergens: null,
    })
  ).product;
  expect(cleared.calories).toBeNull();
  expect(cleared.allergens).toBeNull();
  const stored = await db.withTenantTransaction(
    db.runtime,
    { organizationId: a.company.organization.id },
    (tx) => tx.product.findUniqueOrThrow({ where: { id: product.id } }),
  );
  expect(stored.allergensDeclared).toBe(false);
  expect(stored.allergens).toEqual([]);
  const created = (
    await a.primary.expect('/catalog/products', 'POST', {
      locationId: a.location.id,
      name: 'Produs declarat nou',
      sku: 'NUTRITION-NEW',
      price: '1',
      ...values,
    })
  ).product;
  expect(created).toMatchObject({ ...values, fat: '0.000' });
  const catalog = await manager.expect(`/catalog?locationId=${a.location.id}`);
  expect(catalog.products.find((row: { id: string }) => row.id === created.id)).toMatchObject({
    ...values,
    id: created.id,
    fat: '0.000',
  });
  expect(
    (await a.primary.expect('/audit')).events.some(
      (event: { action: string; targetId: string }) =>
        event.action === 'catalog.product.updated' && event.targetId === product.id,
    ),
  ).toBe(true);
});
