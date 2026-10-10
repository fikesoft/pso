import type {
  CheckoutMode,
  PaymentMethod,
  DemoCheckoutRequest,
  ManualCheckoutRequest,
  Order,
  Receipt,
} from '@pos/contracts';
import type { CashRecoveryModel } from '../../../entities/cash-command';
import type { OwnShiftSelectionModel } from '../../../entities/cash-shift';
import type { Api } from '../../../shared/api';
import type { useOrderCheckout } from './use-order-checkout';
export type CheckoutAttempt =
  | { mode: 'DEMO'; input: DemoCheckoutRequest }
  | { mode: 'MANUAL'; input: ManualCheckoutRequest };
export interface OrderCheckoutInput {
  api: Api;
  order: Order;
  enabled: boolean;
  isExternallyBlocked?: () => boolean;
  recovery: CashRecoveryModel;
  shift: OwnShiftSelectionModel;
  onUpdated: (order: Order) => void;
}
export type OrderCheckoutModel = ReturnType<typeof useOrderCheckout>;
export interface CheckoutFormProps {
  model: OrderCheckoutModel;
  total: string;
  currency: string;
}
export interface CheckoutActionsProps {
  model: OrderCheckoutModel;
  order: Order;
  canDemo: boolean;
  canCollect: boolean;
  disabled?: boolean;
}
export interface ReceiptProps {
  receipt: Receipt;
  onBack: () => void;
}
export interface CheckoutStatusProps {
  mode: CheckoutMode;
}
export type CheckoutAttemptInput = {
  version: number;
  requestKey: string;
} & (
  | { mode: 'DEMO' }
  | {
      mode: 'MANUAL';
      method: PaymentMethod;
      receivedAmount: string;
      cashShiftId: string;
    }
);
