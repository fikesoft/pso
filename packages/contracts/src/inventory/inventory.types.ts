import type { z } from 'zod';
import type { ServiceType } from '../orders';
import type {
  createInventoryDocumentSchema,
  createInventoryItemSchema,
  createRecipeSchema,
  createModifierRecipeSchema,
  inventoryDocumentKindSchema,
  inventoryKindSchema,
  inventoryStatusSchema,
  inventoryUnitSchema,
  recipePurposeSchema,
  updateInventoryItemSchema,
} from './inventory.schema';

export type InventoryKind = z.infer<typeof inventoryKindSchema>;
export type InventoryUnit = z.infer<typeof inventoryUnitSchema>;
export type InventoryStatus = z.infer<typeof inventoryStatusSchema>;
export type RecipePurpose = z.infer<typeof recipePurposeSchema>;
export type InventoryDocumentKind = z.infer<typeof inventoryDocumentKindSchema>;
export type CreateInventoryItemRequest = z.input<typeof createInventoryItemSchema>;
export type UpdateInventoryItemRequest = z.input<typeof updateInventoryItemSchema>;
export type CreateRecipeRequest = z.input<typeof createRecipeSchema>;
export type CreateModifierRecipeRequest = z.input<typeof createModifierRecipeSchema>;
export type CreateInventoryDocumentRequest = z.input<typeof createInventoryDocumentSchema>;
export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  kind: InventoryKind;
  unit: InventoryUnit;
  status: InventoryStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  locationId: string | null;
  balance: string | null;
  reservedQuantity: string | null;
  availableQuantity: string | null;
}
export interface InventoryProduct {
  id: string;
  name: string;
  sku: string;
  status: string;
}
export interface RecipeComponent {
  id: string;
  inventoryItemId: string;
  itemName: string;
  itemSku: string;
  unit: InventoryUnit;
  purpose: RecipePurpose;
  quantityPerUnit: string;
  serviceTypes: ServiceType[];
}
export interface RecipeVersion {
  id: string;
  productId: string;
  version: number;
  reason: string;
  createdAt: string;
  createdByUserId: string;
  components: RecipeComponent[];
}
export interface ModifierRecipeVersion extends RecipeVersion {
  modifierOptionId: string;
}
export interface ModifierRecipeResponse {
  status: 'UNCONFIGURED' | 'PUBLISHED';
  recipe: ModifierRecipeVersion | null;
}
export interface ModifierRecipeOptionsResponse {
  options: {
    modifierOptionId: string;
    optionName: string;
    modifierGroupName: string;
    recipeVersion: number | null;
  }[];
}
export interface InventoryDocument {
  id: string;
  locationId: string;
  kind: InventoryDocumentKind;
  reason: string;
  orderId: string | null;
  orderNumber: number | null;
  actorName: string;
  createdAt: string;
}
export interface InventoryMovement {
  id: string;
  inventoryItemId: string;
  quantity: string;
  countedQuantity: string | null;
  itemName: string;
  itemSku: string;
  unit: InventoryUnit;
  productName: string | null;
  orderItemId: string | null;
  recipeComponentId: string | null;
  modifierRecipeComponentId: string | null;
  orderItemModifierId: string | null;
  document: InventoryDocument;
}
export interface InventoryItemsResponse {
  items: InventoryItem[];
  nextCursor: string | null;
}
export interface InventoryItemResponse {
  item: InventoryItem;
}
export interface InventoryProductsResponse {
  products: InventoryProduct[];
  nextCursor: string | null;
}
export interface RecipeResponse {
  recipe: RecipeVersion | null;
}
export interface InventoryMovementsResponse {
  movements: InventoryMovement[];
  nextCursor: string | null;
}
export interface InventoryDocumentResponse {
  document: InventoryDocument;
  movements: InventoryMovement[];
  balance: string;
}
