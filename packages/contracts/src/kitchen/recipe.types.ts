import type { InventoryUnit, RecipePurpose } from '../inventory';
export interface KitchenRecipeComponent {
  id: string;
  itemName: string;
  unit: InventoryUnit;
  purpose: RecipePurpose;
  quantityPerUnit: string;
  totalQuantity: string;
  recipeVersion: number;
  source: 'BASE' | 'MODIFIER';
  modifierName: string | null;
}
export interface KitchenRecipeResponse {
  ticketId: string;
  ticketItemId: string;
  productName: string;
  quantity: string;
  status: 'AVAILABLE' | 'NO_COMPONENTS' | 'LEGACY_UNAVAILABLE';
  components: KitchenRecipeComponent[];
}
