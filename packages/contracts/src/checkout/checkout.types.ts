import type { Order, ServiceType } from '../orders';
import type { ModifierGroupSnapshotDto } from '../shared';

export type CheckoutMode = 'DEMO' | 'MANUAL';
export type PaymentMethod = 'CASH' | 'CARD';
export interface CheckoutSummary {
  id: string;
  mode: CheckoutMode;
  method: PaymentMethod | null;
  total: string;
  createdAt: string;
}
export interface ReceiptItem {
  productName: string;
  productSku: string;
  quantity: string;
  unitPrice: string;
  taxRateSnapshot: string | null;
  lineTotal: string;
  modifierGroups: ModifierGroupSnapshotDto[];
}
export interface Receipt extends CheckoutSummary {
  deliveryFee: string;
  number: string;
  orderId: string;
  orderNumber: number;
  serviceType: ServiceType;
  tableLabel: string | null;
  companyName: string;
  locationName: string;
  locationCode: string;
  cashierName: string;
  currency: 'MDL';
  receivedAmount: string | null;
  changeAmount: string | null;
  paymentId: string | null;
  isFiscal: false;
  items: ReceiptItem[];
}
export interface CheckoutResponse {
  order: Order;
  receipt: Receipt;
}
export interface ReceiptResponse {
  receipt: Receipt;
}
export interface DemoCheckoutRequest {
  version: number;
  requestKey: string;
}
export type ManualCheckoutRequest = DemoCheckoutRequest & {
  confirmed: true;
  cashShiftId?: string;
} & ({ method: 'CASH'; receivedAmount: string } | { method: 'CARD'; receivedAmount?: never });
