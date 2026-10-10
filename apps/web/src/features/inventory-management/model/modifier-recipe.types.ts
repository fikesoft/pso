import type { Api } from '../../../shared/api';
import type { InventoryProduct } from '@pos/contracts';
import type { useModifierRecipeEditor } from './use-modifier-recipe-editor';

export interface ModifierRecipeEditorProps {
  api: Api;
  productId: string;
  optionId: string;
  productName: string;
  optionName: string;
  onClose: () => void;
}
export type ModifierRecipeEditorModel = ReturnType<typeof useModifierRecipeEditor>;
export interface ModifierRecipeFieldsProps {
  editor: ModifierRecipeEditorModel;
}
export interface ModifierRecipeOptionsProps {
  api: Api;
  product: InventoryProduct;
}
