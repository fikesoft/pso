import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { publishInventoryRecipe } from './fixtures/inventory.fixture';
import type { InventoryFixture } from './fixtures/inventory.types';
import type { OperationsRlsStatus } from './fixtures/operations.types';

export async function runInventoryRecipeTests(t: TestContext, state: InventoryFixture) {
  const { txA, txB, runtime, auth, platform, ingredient } = state;
  await t.test(
    'RLS FORCE și rolurile restrânse acoperă toate cele opt tabele de inventar',
    async () => {
      const policies = await runtime.$queryRaw<OperationsRlsStatus[]>`
      SELECT c.relname AS "tableName",c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
        ('InventoryItem','RecipeVersion','RecipeComponent','InventoryDocument','InventoryMovement','InventoryReservation','InventoryReservationLine','InventoryLegacyOrder')`;
      assert.equal(policies.length, 8);
      assert.ok(policies.every((policy) => policy.enabled && policy.forced));
      assert.deepEqual(await runtime.inventoryItem.findMany(), []);
      assert.deepEqual(await runtime.recipeVersion.findMany(), []);
      assert.deepEqual(await runtime.recipeComponent.findMany(), []);
      assert.deepEqual(await runtime.inventoryDocument.findMany(), []);
      assert.deepEqual(await runtime.inventoryMovement.findMany(), []);
      assert.deepEqual(
        (await txB((tx) => tx.inventoryItem.findMany())).map((item) => item.id),
        [state.foreignItem.id],
      );
      for (const client of [auth, platform]) {
        await assert.rejects(client.inventoryItem.findMany());
        await assert.rejects(client.recipeVersion.findMany());
        await assert.rejects(client.recipeComponent.findMany());
        await assert.rejects(client.inventoryDocument.findMany());
        await assert.rejects(client.inventoryMovement.findMany());
      }
      const permissions = await runtime.permission.findMany({
        where: { key: { startsWith: 'inventory.' } },
      });
      assert.equal(permissions.length, 3);
      assert.ok(permissions.every((permission) => permission.delegable));
    },
  );
  await t.test(
    'identitatea, unitatea și tipul articolului sunt imuabile, cu FK tenant și versiune',
    async () => {
      for (const change of [
        { sku: 'ALT-SKU' },
        { unit: 'ML' },
        { kind: 'PACKAGING' },
        { organizationId: state.b.organization.id },
      ]) {
        await assert.rejects(
          txA((tx) =>
            tx.inventoryItem.update({
              where: { id: ingredient.id },
              data: { ...change, version: { increment: 1 } },
            }),
          ),
        );
      }
      await assert.rejects(
        txA((tx) =>
          tx.inventoryItem.update({
            where: { id: ingredient.id },
            data: { name: 'Fără versiune' },
          }),
        ),
      );
      await assert.rejects(
        txA((tx) =>
          tx.inventoryItem.create({
            data: {
              ...ingredient,
              id: randomUUID(),
              sku: 'FOREIGN-ACTOR',
              createdByUserId: state.b.user.id,
            },
          }),
        ),
      );
      await assert.rejects(
        txA((tx) =>
          tx.inventoryItem.create({
            data: {
              ...ingredient,
              id: randomUUID(),
              organizationId: state.b.organization.id,
            },
          }),
        ),
      );
      await assert.rejects(txA((tx) => tx.inventoryItem.delete({ where: { id: ingredient.id } })));
    },
  );
  const line = {
    inventoryItemId: ingredient.id,
    purpose: 'MAIN',
    quantityPerUnit: '0.125',
    serviceTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
  };
  await t.test(
    'componentele cer scopuri valide, cantitate pozitivă și compatibilitate articol/rol',
    async () => {
      for (const changes of [
        { purpose: 'PACKAGING' },
        { quantityPerUnit: '0' },
        { quantityPerUnit: '1000000' },
        { quantityPerUnit: 'NaN' },
        { serviceTypes: [] },
        { serviceTypes: ['DINE_IN', 'DINE_IN'] },
        { serviceTypes: ['UNKNOWN'] },
        { inventoryItemId: state.foreignItem.id },
      ])
        await assert.rejects(publishInventoryRecipe(state, [{ ...line, ...changes }]));
      const valid = await publishInventoryRecipe(state, [line]);
      await assert.rejects(
        txA((tx) =>
          tx.recipeVersion.create({
            data: {
              ...valid.recipe,
              id: randomUUID(),
              requestKey: randomUUID(),
              productId: state.catalogB.product.id,
            },
          }),
        ),
      );
      await assert.rejects(
        txA((tx) =>
          tx.recipeVersion.create({
            data: {
              ...valid.recipe,
              id: randomUUID(),
              requestKey: randomUUID(),
              version: valid.recipe.version + 2,
            },
          }),
        ),
      );
    },
  );
  await t.test(
    'versiunile și componentele rețetei sunt imuabile și sigilate după commit',
    async () => {
      const { recipe, components } = await publishInventoryRecipe(state, [line]);
      assert.ok(components[0]);
      await assert.rejects(
        txA((tx) =>
          tx.recipeVersion.update({ where: { id: recipe.id }, data: { reason: 'Rescriere' } }),
        ),
      );
      await assert.rejects(txA((tx) => tx.recipeVersion.delete({ where: { id: recipe.id } })));
      await assert.rejects(
        txA((tx) =>
          tx.recipeComponent.update({
            where: { id: components[0].id },
            data: { quantityPerUnit: '100' },
          }),
        ),
      );
      await assert.rejects(
        txA((tx) => tx.recipeComponent.delete({ where: { id: components[0].id } })),
      );
      await assert.rejects(
        txA((tx) =>
          tx.recipeComponent.create({
            data: {
              ...components[0],
              id: randomUUID(),
              position: 1,
              inventoryItemId: state.consumable.id,
              purpose: 'CONSUMABLE',
            },
          }),
        ),
      );
      const empty = await publishInventoryRecipe(state, []);
      assert.equal(empty.recipe.version, recipe.version + 1);
      assert.equal(empty.components.length, 0);
      assert.equal(
        await txA((tx) => tx.recipeComponent.count({ where: { recipeVersionId: recipe.id } })),
        1,
      );
      assert.deepEqual(await txB((tx) => tx.recipeVersion.findMany()), []);
      assert.deepEqual(await txB((tx) => tx.recipeComponent.findMany()), []);
    },
  );
}
