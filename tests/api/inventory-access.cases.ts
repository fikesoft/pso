import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { InventoryItem } from '../../packages/contracts/src';
import type { InventoryFixture } from './inventory.types';
import { noSecrets } from './support/harness';

export async function verifyInventoryAccess(f: InventoryFixture) {
  const manager = await f.login('manager');
  const reader = await f.login('reader');
  const recipes = await f.login('recipes');
  const denied = await f.login('denied');
  const path = `/inventory/items?locationId=${f.a.location.id}`;
  const stocks = await reader.expect(path);
  expect(stocks.items.find((item: InventoryItem) => item.id === f.main.id).balance).toBe(
    '0.000000',
  );
  expect((await manager.expect(path)).items).toHaveLength(4);
  const metadata = await recipes.expect('/inventory/items');
  for (const item of metadata.items)
    expect(item).toMatchObject({
      balance: null,
      reservedQuantity: null,
      availableQuantity: null,
      locationId: null,
    });
  for (const item of (await recipes.expect(path)).items) expect(item.balance).toBeNull();
  expect((await reader.call('/inventory/items')).status).toBe(403);
  expect((await denied.call(path)).status).toBe(403);
  expect((await recipes.call(`/inventory/movements?locationId=${f.a.location.id}`)).status).toBe(
    403,
  );
  expect((await reader.call('/inventory/documents', 'POST', f.document(f.main.id))).status).toBe(
    403,
  );
  expect((await recipes.call('/inventory/documents', 'POST', f.document(f.main.id))).status).toBe(
    403,
  );
  expect(
    (
      await manager.call('/inventory/items', 'POST', {
        name: 'Interzis',
        sku: 'NO',
        kind: 'INGREDIENT',
        unit: 'G',
      })
    ).status,
  ).toBe(403);
  expect(
    (await manager.call(`/inventory/items/${f.main.id}`, 'PATCH', { version: 1, name: 'Interzis' }))
      .status,
  ).toBe(403);
  expect(
    (await manager.call(`/inventory/recipes/${f.product.id}`, 'POST', f.recipe())).status,
  ).toBe(403);
  expect((await recipes.call(`/catalog?locationId=${f.a.location.id}`)).status).toBe(403);
  expect((await recipes.expect('/inventory/products')).products).toHaveLength(2);
  expect((await manager.call(`/inventory/items?locationId=${f.otherLocation.id}`)).status).toBe(
    403,
  );
  expect(
    (
      await manager.call(
        '/inventory/documents',
        'POST',
        f.document(f.main.id, { locationId: f.otherLocation.id }),
      )
    ).status,
  ).toBe(403);
  expect((await recipes.call(`/inventory/items?locationId=${f.b.location.id}`)).status).toBe(404);
  expect(
    (await f.b.primary.call(`/inventory/items/${f.main.id}?locationId=${f.b.location.id}`)).status,
  ).toBe(404);
  expect(
    (
      await f.b.primary.call(
        '/inventory/documents',
        'POST',
        f.document(f.main.id, { locationId: f.b.location.id }),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await f.a.primary.call(
        `/inventory/items?locationId=${f.a.location.id}&cursor=${randomUUID()}`,
      )
    ).status,
  ).toBe(400);
  noSecrets(stocks);
  noSecrets(metadata);
}
