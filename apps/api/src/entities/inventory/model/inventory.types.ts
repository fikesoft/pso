import type { TenantTransaction } from '@pos/db';

export interface LatestRecipe {
  id: string;
  productId: string;
}
export interface LatestModifierRecipe extends LatestRecipe {
  modifierOptionId: string;
}

export type StoredInventoryItem = NonNullable<
  Awaited<ReturnType<TenantTransaction['inventoryItem']['findUnique']>>
>;
export type StoredRecipeVersion = NonNullable<
  Awaited<ReturnType<TenantTransaction['recipeVersion']['findUnique']>>
>;
export type StoredModifierRecipeVersion = NonNullable<
  Awaited<ReturnType<TenantTransaction['modifierRecipeVersion']['findUnique']>>
>;
export type StoredInventoryDocument = NonNullable<
  Awaited<ReturnType<TenantTransaction['inventoryDocument']['findUnique']>>
>;
export type StoredInventoryMovement = NonNullable<
  Awaited<ReturnType<TenantTransaction['inventoryMovement']['findUnique']>>
>;
export interface FinalizeInventoryInput {
  organizationId: string;
  locationId: string;
  orderId: string;
  requestKey: string;
  requestHash: string;
  actorUserId: string;
  actorName: string;
}
export interface ConsumptionInput extends FinalizeInventoryInput {
  serviceType: string;
  items: { id: string; productId: string; productName: string; quantity: string }[];
}

export interface StockLevel {
  inventoryItemId: string;
  balance: string;
  reservedQuantity: string;
}
