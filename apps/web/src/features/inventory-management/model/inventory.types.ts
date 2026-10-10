import type {
  InventoryItem,
  InventoryUnit,
  InventoryDocumentKind,
  InventoryProduct,
  RecipePurpose,
  ServiceType,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { useInventoryManagement } from './use-inventory-management';
import type { useItemEditor } from './use-item-editor';
import type { useRecipeEditor } from './use-recipe-editor';
export interface InventoryManagementProps {
  api: Api;
  locationId: string;
  locationName: string;
  canViewStock: boolean;
  canManageStock: boolean;
  canManageItems: boolean;
  canManageRecipes: boolean;
}
export type InventoryView = 'stock' | 'recipes' | 'ledger';
export type ManualMovementKind = Exclude<InventoryDocumentKind, 'CONSUMPTION'>;
export interface LedgerFilters {
  inventoryItemId: string;
  kind: InventoryDocumentKind | '';
}
export type InventoryDialog =
  | { kind: 'item'; item: InventoryItem | null }
  | { kind: 'movement'; item: InventoryItem; movementKind: ManualMovementKind };
export type InventoryModel = ReturnType<typeof useInventoryManagement>;
export interface InventoryComponentProps {
  model: InventoryModel;
}
export interface ItemEditorProps {
  api: Api;
  item: InventoryItem | null;
  locationId: string;
  onClose: () => void;
  onSaved: () => void;
}
export type ItemEditorModel = ReturnType<typeof useItemEditor>;
export interface ItemFieldsProps {
  model: ItemEditorModel;
}
export interface MovementEditorProps extends Omit<ItemEditorProps, 'item'> {
  item: InventoryItem;
  kind: ManualMovementKind;
}
export interface InventoryCardProps {
  item: InventoryItem;
  canManageItems: boolean;
  canManageStock: boolean;
  onEdit: () => void;
  onMovement: (kind: ManualMovementKind) => void;
}
export interface InventoryActionOptions<Input, Output> {
  operation: (input: Input) => Promise<Output>;
  onSaved: (result: Output) => void;
  isConfirmedUncommitted?: (error: unknown) => boolean;
}
export interface RecipeLine {
  clientId: string;
  inventoryItemId: string;
  purpose: RecipePurpose;
  quantityPerUnit: string;
  serviceTypes: ServiceType[];
  itemName?: string;
  unit?: InventoryUnit;
}
export interface RecipeEditorProps extends InventoryComponentProps {
  product: InventoryProduct;
  onClose: () => void;
}
export type RecipeEditorModel = ReturnType<typeof useRecipeEditor>;
export interface RecipeLineProps {
  editor: Pick<RecipeEditorModel, 'changeItem' | 'patchLine' | 'removeLine'>;
  items: readonly InventoryItem[];
  line: RecipeLine;
  index: number;
}
export interface RecipePreviewProps {
  api: Api;
  productId: string;
}
