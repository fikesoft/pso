import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInventoryFixture, publishInventoryRecipe } from './fixtures/inventory.fixture';
import { publishKitchenFixture } from './fixtures/operations-kitchen.fixture';
import { readKitchenRecipeComponents } from '../../../apps/api/src/features/kitchen/model/read-kitchen-recipe';
test('PostgreSQL: citirea rețetei KDS folosește snapshotul și respectă RLS inclusiv fără context', async () => {
  const f = await createInventoryFixture();
  try {
    await publishInventoryRecipe(f, [
      {
        inventoryItemId: f.ingredient.id,
        purpose: 'MAIN',
        quantityPerUnit: '2.333',
        serviceTypes: ['DINE_IN'],
      },
    ]);
    const draft = await f.createDraft();
    await publishKitchenFixture(f, draft);
    const read = (tx: Parameters<typeof readKitchenRecipeComponents>[0]) =>
      readKitchenRecipeComponents(tx, f.a.organization.id, f.locationA.id, draft.item.id);
    const result = await f.txA(read);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.totalQuantity, '2.333000');
    assert.equal(result[0]!.recipeVersion, 1);
    assert.deepEqual(await f.txB(read), []);
    assert.deepEqual(await read(f.runtime), []);
    await publishInventoryRecipe(f, []);
    assert.deepEqual(await f.txA(read), result);
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
