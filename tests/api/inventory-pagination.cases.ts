import { expect } from 'vitest';
import type { InventoryFixture } from './inventory.types';

export async function verifyInventoryPagination(f: InventoryFixture) {
  const primary = f.a.primary;
  const items = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await primary.expect(
      `/inventory/items?locationId=${f.a.location.id}&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
    );
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(items.has(item.id)).toBe(false);
      items.add(item.id);
    }
    cursor = page.nextCursor;
  } while (cursor);
  expect(items.size).toBeGreaterThanOrEqual(6);
  const movements = new Set<string>();
  do {
    const page = await primary.expect(
      `/inventory/movements?locationId=${f.a.location.id}&kind=CONSUMPTION&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
    );
    for (const movement of page.movements) {
      expect(movements.has(movement.id)).toBe(false);
      movements.add(movement.id);
      expect(movement.document.kind).toBe('CONSUMPTION');
    }
    cursor = page.nextCursor;
  } while (cursor);
  expect(movements.size).toBeGreaterThanOrEqual(10);
  const first = movements.values().next().value!;
  expect(
    (await primary.call(`/inventory/movements?locationId=${f.otherLocation.id}&cursor=${first}`))
      .status,
  ).toBe(400);
  expect(
    (await f.b.primary.call(`/inventory/movements?locationId=${f.b.location.id}&cursor=${first}`))
      .status,
  ).toBe(400);
  expect(
    (
      await primary.call(
        `/inventory/movements?locationId=${f.a.location.id}&kind=COUNT&cursor=${first}`,
      )
    ).status,
  ).toBe(400);
  const productPage = await primary.expect('/inventory/products?limit=1');
  const productNext = await primary.expect(
    `/inventory/products?limit=1&cursor=${productPage.nextCursor}`,
  );
  expect(productNext.products[0].id).not.toBe(productPage.products[0].id);
}

export async function verifyInventoryReplayAuthorization(f: InventoryFixture) {
  const manager = await f.login('manager');
  const request = f.document(f.auxiliary.id, { quantity: '1' });
  await manager.expect('/inventory/documents', 'POST', request);
  await f.a.primary.expect(`/staff/${f.actors.manager.user.id}/overrides`, 'POST', {
    permission: 'inventory.manage',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  expect((await manager.call('/inventory/documents', 'POST', request)).status).toBe(401);
  const fresh = await f.login('manager');
  expect((await fresh.call('/inventory/documents', 'POST', request)).status).toBe(403);
  const recipes = await f.login('recipes');
  const body = f.recipe({
    expectedVersion: 2,
    components: [],
    reason: 'Versiune pentru verificarea revocării',
  });
  await recipes.expect(`/inventory/recipes/${f.secondProduct.id}`, 'POST', body);
  await f.a.primary.expect(`/staff/${f.actors.recipes.user.id}/overrides`, 'POST', {
    permission: 'inventory.recipes.manage',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const after = await f.login('recipes');
  expect((await after.call(`/inventory/recipes/${f.secondProduct.id}`, 'POST', body)).status).toBe(
    403,
  );
}
