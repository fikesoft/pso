import type { CollectPaymentRequest, RefundPaymentRequest, PaymentRecord } from '@pos/contracts';
import type { OrderCheckoutInput } from './checkout.types';
import type { useOrderPayments } from './use-order-payments';

export type CollectionMethod = 'CASH' | 'CARD' | 'MIXED';
export interface PaymentFormState {
  kind: 'COLLECT' | 'REFUND';
  method: CollectionMethod;
  cashAmount: string;
  cardAmount: string;
  receivedAmount: string;
  refundAmount: string;
  reason: string;
  payment: PaymentRecord | null;
  confirmed: boolean;
}
export type PaymentAttempt =
  | { kind: 'COLLECT'; body: CollectPaymentRequest }
  | { kind: 'REFUND'; body: RefundPaymentRequest };
export type OrderPaymentsInput = OrderCheckoutInput;
export type OrderPaymentsModel = ReturnType<typeof useOrderPayments>;
export interface PaymentFormProps {
  model: OrderPaymentsModel;
}
export interface OrderPaymentsProps extends PaymentFormProps {
  order: OrderCheckoutInput['order'];
  canCollect: boolean;
  canRefund: boolean;
  disabled: boolean;
}
