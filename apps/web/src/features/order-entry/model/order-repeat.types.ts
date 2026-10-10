import type {
  CatalogProduct,
  OrderRepeatPreviewLine,
  OrderRepeatSource,
  OrderRepeatPreviewResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { DraftLine, OrderDraftModel, OrderEditorProps } from './order-entry.types';
export interface RepeatRow {
  line: OrderRepeatPreviewLine;
  product: CatalogProduct | null;
  draft: DraftLine | null;
  removed: boolean;
}
export interface DraftRepeatProps {
  model: OrderDraftModel;
  props: OrderEditorProps;
}
export interface RepeatPreviewProps extends DraftRepeatProps {
  source: OrderRepeatSource;
}
export interface RepeatRowProps {
  row: RepeatRow;
  disabled: boolean;
  onRemove: () => void;
  onRepair: () => void;
}
export interface LastCustomerOrderProps {
  api: Api;
  customerId: string;
  locationId: string;
  disabled: boolean;
  onRepeat: (source: OrderRepeatSource) => void;
}

export interface PreparedRepeat {
  response: OrderRepeatPreviewResponse | null;
  rows: RepeatRow[];
}
