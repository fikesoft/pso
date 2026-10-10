import type { CatalogProduct, ModifierOptionDto, ProductModifierGroupDto } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { useProductModifiers } from './use-product-modifiers';

export interface ProductModifiersProps {
  api: Api;
  locationId: string;
  product: CatalogProduct;
  editable: boolean;
  onSaved: () => Promise<void>;
  onLockedChange: (locked: boolean) => void;
  onEditRecipe?: (option: ModifierOptionDto) => void;
}
export type ProductModifiersModel = ReturnType<typeof useProductModifiers>;
export interface ProductModifierBindingProps {
  binding: ProductModifierGroupDto;
  model: ProductModifiersModel;
  editable: boolean;
  onEditRecipe?: (option: ModifierOptionDto) => void;
}
