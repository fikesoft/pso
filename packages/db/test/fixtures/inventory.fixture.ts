import { createHash, randomUUID } from 'node:crypto';
import { createOperationsFixture } from './operations.fixture';
import type { InventoryFixture, InventoryFixtureLine } from './inventory.types';

export async function createInventoryFixture() {
  const state = await createOperationsFixture();
  const createItem = (sku: string, kind = 'INGREDIENT', unit = 'G') =>
    state.txA((tx) =>
      tx.inventoryItem.create({
        data: {
          organizationId: state.a.organization.id,
          sku,
          name: `Articol sintetic ${sku}`,
          kind,
          unit,
          createdByUserId: state.a.user.id,
        },
      }),
    );
  const ingredient = await createItem('INGREDIENT');
  const packaging = await createItem('PACKAGING', 'PACKAGING', 'PCS');
  const consumable = await createItem('CONSUMABLE', 'CONSUMABLE', 'ML');
  const foreignItem = await state.txB((tx) =>
    tx.inventoryItem.create({
      data: {
        organizationId: state.b.organization.id,
        sku: ingredient.sku,
        name: 'Articol sintetic B',
        kind: 'INGREDIENT',
        unit: 'G',
        createdByUserId: state.b.user.id,
      },
    }),
  );
  return { ...state, ingredient, packaging, consumable, foreignItem, createItem };
}

export async function publishInventoryRecipe(
  state: InventoryFixture,
  lines: InventoryFixtureLine[],
) {
  return state.txA(async (tx) => {
    const latest = await tx.recipeVersion.aggregate({
      where: { productId: state.catalogA.product.id },
      _max: { version: true },
    });
    const recipe = await tx.recipeVersion.create({
      data: {
        organizationId: state.a.organization.id,
        productId: state.catalogA.product.id,
        version: (latest._max.version ?? 0) + 1,
        requestKey: randomUUID(),
        requestHash: createHash('sha256').update(randomUUID()).digest('hex'),
        reason: 'Versiune sintetică pentru test',
        createdByUserId: state.a.user.id,
      },
    });
    const components = [];
    for (const [position, line] of lines.entries()) {
      components.push(
        await tx.recipeComponent.create({
          data: {
            ...line,
            organizationId: state.a.organization.id,
            recipeVersionId: recipe.id,
            position,
          },
        }),
      );
    }
    return { recipe, components };
  });
}

export async function inventoryBalance(state: InventoryFixture, inventoryItemId: string) {
  const total = await state.txA((tx) =>
    tx.inventoryMovement.aggregate({
      where: { inventoryItemId, locationId: state.locationA.id },
      _sum: { quantity: true },
    }),
  );
  return total._sum.quantity?.toFixed(6) ?? '0.000000';
}
