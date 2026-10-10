import type { CatalogCategory } from '@pos/contracts';
import type { OrderEditorProps, OrderDraftModel, OrderEntryProps } from './order-entry.types';
export type OperatorMode = 'operator' | 'cashier';
export interface OperatorOrderEntryProps extends OrderEntryProps {
  mode?: OperatorMode;
}
export interface OperatorComposerProps extends OrderEditorProps {
  categories: CatalogCategory[];
  mode?: OperatorMode;
}
export interface OperatorProductsProps extends OperatorComposerProps {
  model: OrderDraftModel;
}
