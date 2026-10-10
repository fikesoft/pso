import type { CashMovementCommandIdentity } from '../cash-movements';
import type { z } from 'zod';
import type { PaymentOperationRecord } from '../payments';
import type { Receipt } from '../checkout';
import type { CASH_SHIFT_STATUSES } from './config/cash-shift.constants';
import type {
  cashShiftListSchema,
  cashShiftOpenSchema,
  cashShiftCloseSchema,
  cashShiftResolutionSchema,
  paymentCommandResolutionSchema,
  manualCheckoutResolutionSchema,
} from './cash-shift.schema';
export type CashShiftStatus = (typeof CASH_SHIFT_STATUSES)[number];
export interface CashShiftDto {
  id: string;
  locationId: string;
  registerId: string;
  registerCode: string;
  registerName: string;
  ownerUserId: string;
  ownerDisplayName: string;
  status: CashShiftStatus;
  version: number;
  openingAmount: string;
  currency: 'MDL';
  openedAt: string;
  closedAt: string | null;
}
export interface CashFinancialSummaryV1 {
  cashCollected: string;
  cashRefunded: string;
  expectedCash: string;
  cardCollected: string;
  cardRefunded: string;
  cardNet: string;
  paidOrderCount: number;
  refundOperationCount: number;
}
export interface CashShiftSummary extends CashFinancialSummaryV1 {
  cashIn: string;
  cashOut: string;
}
export interface CashClosingDto {
  id: string;
  shiftId: string;
  shiftVersion: number;
  expectedCash: string;
  countedCash: string;
  difference: string;
  discrepancyReason: string | null;
  managerReason: string | null;
  closedByUserId: string;
  closedByDisplayName: string;
  closedAt: string;
  summary: CashFinancialSummaryV1 | CashShiftSummary;
}
export type CashShiftListRequest = z.input<typeof cashShiftListSchema>;
export type CashShiftOpenRequest = z.input<typeof cashShiftOpenSchema>;
export type CashShiftCloseRequest = z.input<typeof cashShiftCloseSchema>;
export type CashShiftResolutionRequest = z.input<typeof cashShiftResolutionSchema>;
export type PaymentCommandResolutionRequest = z.input<typeof paymentCommandResolutionSchema>;
export type ManualCheckoutResolutionRequest = z.input<typeof manualCheckoutResolutionSchema>;
export interface CashShiftListResponse {
  shifts: CashShiftDto[];
  nextCursor: string | null;
}
export interface CashShiftOpenResponse {
  shift: CashShiftDto;
}
export interface CashShiftCloseResponse {
  shift: CashShiftDto;
  closing: CashClosingDto;
}
export interface CashShiftDetailResponse {
  shift: CashShiftDto;
  summary: CashShiftSummary;
  closing: CashClosingDto | null;
}
export type CashShiftCommandIdentity = CashShiftResolutionRequest;
export type PaymentCommandIdentity = PaymentCommandResolutionRequest & { orderId: string };
export type ManualCheckoutCommandIdentity = ManualCheckoutResolutionRequest & {
  kind: 'CHECKOUT_MANUAL';
  orderId: string;
};
export type CashCommandIdentity =
  | CashShiftCommandIdentity
  | PaymentCommandIdentity
  | ManualCheckoutCommandIdentity
  | CashMovementCommandIdentity;
export type CashShiftResolutionResponse =
  | {
      status: 'SUCCEEDED';
      command: Extract<CashShiftCommandIdentity, { kind: 'OPEN' }>;
      result: CashShiftOpenResponse;
    }
  | {
      status: 'SUCCEEDED';
      command: Extract<CashShiftCommandIdentity, { kind: 'CLOSE' }>;
      result: CashShiftCloseResponse;
    }
  | { status: 'RETIRED'; command: CashShiftCommandIdentity };
export type PaymentCommandResolutionResponse =
  | {
      status: 'SUCCEEDED';
      command: PaymentCommandIdentity;
      result: { operation: PaymentOperationRecord };
    }
  | { status: 'RETIRED'; command: PaymentCommandIdentity };
export type ManualCheckoutResolutionResponse =
  | { status: 'SUCCEEDED'; command: ManualCheckoutCommandIdentity; result: { receipt: Receipt } }
  | { status: 'RETIRED'; command: ManualCheckoutCommandIdentity };
