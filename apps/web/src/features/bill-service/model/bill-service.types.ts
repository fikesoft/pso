import type {
  BillContext,
  BillSplitDto,
  BillSplitPreviewDto,
  BillItemAllocationDto,
} from '@pos/contracts/bill-splits';
import type { BillAccessProps, BillOperationModel } from '../../../entities/bill-split';
import type { useBillService } from './use-bill-service';
export interface BillServiceProps extends BillAccessProps {
  context?: BillContext;
  blocked: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onLockedChange: (locked: boolean) => void;
}
export type BillServiceModel = ReturnType<typeof useBillService>;
export interface BillFormProps extends BillAccessProps {
  context: BillContext;
  operation: BillOperationModel;
  disabled: boolean;
  onClose: () => void;
}
export interface BillDetailsProps {
  model: BillServiceModel;
  props: BillServiceProps;
  split: BillSplitDto;
}
export interface BillPaymentFormProps extends BillAccessProps {
  partId: string;
  operation: BillOperationModel;
  disabled: boolean;
  onClose: () => void;
}
export interface BillRecoveryProps {
  operation: BillOperationModel;
  onRefresh: () => void;
}
export interface BillVoidFormProps {
  split: BillSplitDto;
  operation: BillOperationModel;
  disabled: boolean;
}
export interface BillItemsFormProps extends BillFormProps {
  onAmounts: () => void;
}

export interface BillItemLinesProps {
  bill: BillSplitPreviewDto;
  items?: BillItemAllocationDto[];
}
