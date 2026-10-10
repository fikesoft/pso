import type { z } from 'zod';
import type { Order } from '../orders';
import type { PaymentMethod } from '../checkout';
import type { PAYMENT_STATUSES } from './config/payment.constants';
import type { collectPaymentSchema, refundPaymentSchema } from './payments.schema';

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type CollectPaymentRequest = z.input<typeof collectPaymentSchema>;
export type RefundPaymentRequest = z.input<typeof refundPaymentSchema>;
export interface PaymentSummary {
  status: PaymentStatus;
  collectedAmount: string;
  refundedAmount: string;
  netPaidAmount: string;
  outstandingAmount: string;
}
export interface PaymentRecord {
  id: string;
  method: PaymentMethod;
  amount: string;
  refundedAmount: string;
  refundableAmount: string;
  receivedAmount: string | null;
  changeAmount: string | null;
  checkoutId: string | null;
  operationId: string | null;
  confirmedByUserId: string;
  createdAt: string;
}
export interface PaymentsResponse {
  summary: PaymentSummary;
  payments: PaymentRecord[];
  nextCursor: string | null;
}
export interface PaymentOperationRecord {
  id: string;
  kind: 'COLLECT' | 'REFUND';
  orderVersion: number;
  amount: string;
  fromStatus: PaymentStatus;
  toStatus: PaymentStatus;
  reason: string | null;
  actorUserId: string;
  createdAt: string;
}
export interface PaymentCommandResponse {
  order: Order;
  operation: PaymentOperationRecord;
}
export interface PaymentOperationsResponse {
  operations: PaymentOperationRecord[];
  nextCursor: string | null;
}
