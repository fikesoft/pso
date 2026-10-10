import { randomUUID } from 'node:crypto';
import type { OperationsFixture } from './operations.types';

export async function createModifierFixture(state: OperationsFixture) {
  return state.txA(async (tx) => {
    const organizationId = state.a.organization.id;
    const group = await tx.modifierGroup.create({
      data: {
        organizationId,
        name: 'Mărime sintetică',
        minSelections: 1,
        maxSelections: 1,
        createdByUserId: state.a.user.id,
      },
    });
    const options = await Promise.all(
      ['Mic', 'Mare'].map((name) =>
        tx.modifierOption.create({
          data: { organizationId, modifierGroupId: group.id, name, extraPrice: '0.3333' },
        }),
      ),
    );
    const binding = await tx.productModifierGroup.create({
      data: { organizationId, productId: state.catalogA.product.id, modifierGroupId: group.id },
    });
    const item = await tx.inventoryItem.create({
      data: {
        organizationId,
        sku: randomUUID(),
        name: 'Ingredient modificator',
        kind: 'INGREDIENT',
        unit: 'G',
        createdByUserId: state.a.user.id,
      },
    });
    const currentGroup = await tx.modifierGroup.findUniqueOrThrow({ where: { id: group.id } });
    return { group: currentGroup, options, binding, item };
  });
}

export function modifierRecipeData(state: OperationsFixture, optionId: string, version = 1) {
  return {
    organizationId: state.a.organization.id,
    productId: state.catalogA.product.id,
    modifierOptionId: optionId,
    version,
    requestKey: randomUUID(),
    requestHash: 'a'.repeat(64),
    reason: 'Rețetă sintetică explicită',
    createdByUserId: state.a.user.id,
  };
}
