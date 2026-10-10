import type { OperationalPanelProps } from '../../../shared/model/operations.types';
import type { CatalogProduct, ModifierOptionDto } from '@pos/contracts';
export interface CatalogWorkspaceProps extends OperationalPanelProps {
  canManageRecipes: boolean;
}
export type SelectedModifierRecipe = { product: CatalogProduct; option: ModifierOptionDto };
