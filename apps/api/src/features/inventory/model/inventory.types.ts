import type { z } from 'zod';
import type {
  createInventoryDocumentSchema,
  createRecipeSchema,
  inventoryMovementsQuerySchema,
} from '@pos/contracts';

export type InventoryDocumentInput = z.infer<typeof createInventoryDocumentSchema>;
export type RecipeInput = z.infer<typeof createRecipeSchema>;
export type InventoryMovementsQuery = z.infer<typeof inventoryMovementsQuerySchema>;
export interface MovementCursor {
  id: string;
  documentId: string;
  createdAt: Date;
}
export interface ModifierRecipeVersionRow {
  modifierOptionId: string;
  version: number;
}
