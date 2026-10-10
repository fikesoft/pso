import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations } from './api/operations-setup';
import { prepareInventory } from './api/inventory-setup';
import type { InventoryFixture } from './api/inventory.types';

let fixture: InventoryFixture;
beforeAll(async () => {
  fixture = await prepareInventory();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

it('publishes modifier recipes with recipe-only rights and consumes immutable selected components', async () => {
  const f = fixture;
  const owner = f.a.primary;
  const group = (
    await owner.expect('/catalog/modifier-groups', 'POST', {
      name: 'Adaos inventar',
      minSelections: 0,
      maxSelections: 1,
      sortOrder: 1,
    })
  ).modifierGroup;
  const option = (
    await owner.expect(`/catalog/modifier-groups/${group.id}/options`, 'POST', {
      name: 'Extra ingredient',
      extraPrice: '1.2500',
      sortOrder: 1,
    })
  ).modifierOption;
  await owner.expect(`/catalog/products/${f.product.id}/modifier-groups`, 'POST', {
    modifierGroupId: group.id,
  });
  const recipes = await f.login('recipes');
  const optionsPath = `/inventory/products/${f.product.id}/modifier-options`;
  expect((await recipes.expect(optionsPath)).options).toEqual([
    {
      modifierOptionId: option.id,
      optionName: 'Extra ingredient',
      modifierGroupName: 'Adaos inventar',
      recipeVersion: null,
    },
  ]);
  expect((await f.b.primary.call(optionsPath)).status).toBe(404);
  const fresh = (
    await owner.expect(`/catalog/products/${f.product.id}?locationId=${f.a.location.id}`)
  ).product.modifierGroups[0];
  const selection = {
    bindingId: fresh.id,
    bindingVersion: fresh.version,
    groupVersion: fresh.group.version,
    optionIds: [option.id],
  };
  const unconfigured = (
    await owner.expect(
      '/orders',
      'POST',
      f.draft({ items: [{ productId: f.product.id, quantity: '1', modifiers: [selection] }] }),
    )
  ).order;
  expect(
    (
      await owner.call(`/orders/${unconfigured.id}/send`, 'POST', {
        version: unconfigured.version,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  expect((await f.stored(unconfigured.id)).reservation).toBeNull();
  const path = `/inventory/modifier-recipes/${f.product.id}/${option.id}`;
  expect(await recipes.expect(path)).toEqual({ status: 'UNCONFIGURED', recipe: null });
  const first = {
    expectedVersion: 0,
    requestKey: randomUUID(),
    reason: 'Adaos sintetic',
    components: [
      {
        inventoryItemId: f.auxiliary.id,
        purpose: 'AUXILIARY',
        quantityPerUnit: '3.000',
        serviceTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
      },
    ],
  };
  const published = await recipes.expect(path, 'POST', first);
  expect(published).toMatchObject({ status: 'PUBLISHED', recipe: { version: 1 } });
  expect((await recipes.expect(path, 'POST', first)).recipe.id).toBe(published.recipe.id);
  expect((await recipes.expect(optionsPath)).options[0].recipeVersion).toBe(1);
  expect((await recipes.call(path, 'POST', { ...first, reason: 'Alt text' })).status).toBe(409);
  const sent = await f.send({
    items: [{ productId: f.product.id, quantity: '2.000', modifiers: [selection] }],
  });
  const pending = await f.stored(sent.order.id);
  expect(pending.reservation?.status).toBe('PENDING');
  expect(pending.lines).toHaveLength(1);
  expect(pending.lines[0]).toMatchObject({
    recipeComponentId: null,
    quantity: expect.objectContaining({}),
  });
  expect(pending.lines[0]!.modifierRecipeComponentId).toBe(published.recipe.components[0].id);
  expect(pending.lines[0]!.orderItemModifierId).toBeTruthy();
  expect(pending.lines[0]!.quantity.toFixed(6)).toBe('6.000000');
  await recipes.expect(path, 'POST', {
    expectedVersion: 1,
    requestKey: randomUUID(),
    reason: 'Fără efect de stoc',
    components: [],
  });
  await f.finish(sent.order.id, sent.ticket.id);
  const consumed = await f.stored(sent.order.id);
  expect(consumed.reservation?.status).toBe('CONSUMED');
  expect(consumed.movements).toHaveLength(1);
  expect(consumed.movements[0]!.modifierRecipeComponentId).toBe(published.recipe.components[0].id);
  expect(consumed.movements[0]!.quantity.toFixed(6)).toBe('-6.000000');
  const ledger = await owner.expect(
    `/inventory/movements?locationId=${f.a.location.id}&kind=CONSUMPTION`,
  );
  expect(
    ledger.movements.find((entry: { id: string }) => entry.id === consumed.movements[0]!.id),
  ).toMatchObject({
    recipeComponentId: null,
    modifierRecipeComponentId: published.recipe.components[0].id,
    orderItemModifierId: pending.lines[0]!.orderItemModifierId,
  });
  const later = await f.send({
    items: [{ productId: f.product.id, quantity: '1.000', modifiers: [selection] }],
  });
  expect((await f.stored(later.order.id)).lines).toHaveLength(0);
});
