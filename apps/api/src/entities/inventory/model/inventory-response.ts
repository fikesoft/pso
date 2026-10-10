import { quantityString, quantityUnits } from './quantities';
import type {
  InventoryDocument,
  InventoryItem,
  InventoryMovement,
  ModifierRecipeVersion,
  RecipeVersion,
} from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type {
  StoredInventoryDocument,
  StoredInventoryItem,
  StoredInventoryMovement,
  StoredRecipeVersion,
  StoredModifierRecipeVersion,
} from './inventory.types';

export function inventoryItemResponse(
  item: StoredInventoryItem,
  locationId: string | null = null,
  balance: string | null = null,
  reservedQuantity: string | null = null,
): InventoryItem {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    kind: item.kind as InventoryItem['kind'],
    unit: item.unit as InventoryItem['unit'],
    status: item.status as InventoryItem['status'],
    version: item.version,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    locationId,
    balance,
    reservedQuantity,
    availableQuantity:
      balance !== null && reservedQuantity !== null
        ? quantityString(quantityUnits(balance) - quantityUnits(reservedQuantity))
        : null,
  };
}
export async function recipeResponse(
  tx: TenantTransaction,
  recipe: StoredRecipeVersion,
): Promise<RecipeVersion> {
  const components = await tx.recipeComponent.findMany({
    where: { recipeVersionId: recipe.id },
    orderBy: { position: 'asc' },
  });
  const materials = await tx.inventoryItem.findMany({
    where: { id: { in: components.map((component) => component.inventoryItemId) } },
  });
  return {
    id: recipe.id,
    productId: recipe.productId,
    version: recipe.version,
    reason: recipe.reason,
    createdByUserId: recipe.createdByUserId,
    createdAt: recipe.createdAt.toISOString(),
    components: components.map((component) => {
      const item = materials.find((material) => material.id === component.inventoryItemId)!;
      return {
        id: component.id,
        inventoryItemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        unit: item.unit as InventoryItem['unit'],
        purpose: component.purpose as RecipeVersion['components'][number]['purpose'],
        quantityPerUnit: component.quantityPerUnit.toFixed(3),
        serviceTypes: component.serviceTypes as RecipeVersion['components'][number]['serviceTypes'],
      };
    }),
  };
}
export async function modifierRecipeResponse(
  tx: TenantTransaction,
  recipe: StoredModifierRecipeVersion,
): Promise<ModifierRecipeVersion> {
  const components = await tx.modifierRecipeComponent.findMany({
    where: { modifierRecipeVersionId: recipe.id },
    orderBy: { position: 'asc' },
  });
  const materials = await tx.inventoryItem.findMany({
    where: { id: { in: components.map((component) => component.inventoryItemId) } },
  });
  return {
    id: recipe.id,
    productId: recipe.productId,
    modifierOptionId: recipe.modifierOptionId,
    version: recipe.version,
    reason: recipe.reason,
    createdByUserId: recipe.createdByUserId,
    createdAt: recipe.createdAt.toISOString(),
    components: components.map((component) => {
      const item = materials.find((material) => material.id === component.inventoryItemId)!;
      return {
        id: component.id,
        inventoryItemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        unit: item.unit as InventoryItem['unit'],
        purpose: component.purpose as ModifierRecipeVersion['components'][number]['purpose'],
        quantityPerUnit: component.quantityPerUnit.toFixed(3),
        serviceTypes:
          component.serviceTypes as ModifierRecipeVersion['components'][number]['serviceTypes'],
      };
    }),
  };
}
export async function inventoryDocumentResponse(
  tx: TenantTransaction,
  document: StoredInventoryDocument,
): Promise<InventoryDocument> {
  const order = document.orderId
    ? await tx.order.findUnique({ where: { id: document.orderId }, select: { number: true } })
    : null;
  return {
    id: document.id,
    locationId: document.locationId,
    kind: document.kind as InventoryDocument['kind'],
    reason: document.reason,
    orderId: document.orderId,
    orderNumber: order?.number ?? null,
    actorName: document.actorName,
    createdAt: document.createdAt.toISOString(),
  };
}
export function inventoryMovementResponse(
  movement: StoredInventoryMovement,
  document: InventoryDocument,
): InventoryMovement {
  return {
    id: movement.id,
    inventoryItemId: movement.inventoryItemId,
    quantity: movement.quantity.toFixed(6),
    countedQuantity: movement.countedQuantity?.toFixed(6) ?? null,
    itemName: movement.itemName,
    itemSku: movement.itemSku,
    unit: movement.unit as InventoryItem['unit'],
    productName: movement.productName,
    orderItemId: movement.orderItemId,
    recipeComponentId: movement.recipeComponentId,
    modifierRecipeComponentId: movement.modifierRecipeComponentId,
    orderItemModifierId: movement.orderItemModifierId,
    document,
  };
}
