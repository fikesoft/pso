import type { OrderDraftModel, OrderEditorProps } from './order-entry.types';
export interface DraftSectionProps {
  model: OrderDraftModel;
  props: OrderEditorProps;
}

export interface DraftCategoriesProps {
  props: OrderEditorProps;
}
