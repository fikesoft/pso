import type { Prisma } from '@pos/db';
export type StoredCashShift = Prisma.CashShiftGetPayload<Record<string, never>>;
export type StoredCashClosing = Prisma.CashClosingGetPayload<Record<string, never>>;
export interface StoredCashSummaryV1 {
  cashCollected: Prisma.Decimal;
  cashRefunded: Prisma.Decimal;
  expectedCash: Prisma.Decimal;
  cardCollected: Prisma.Decimal;
  cardRefunded: Prisma.Decimal;
  cardNet: Prisma.Decimal;
  paidOrderCount: bigint;
  refundOperationCount: bigint;
}

export interface StoredCashSummary extends StoredCashSummaryV1 {
  cashIn: Prisma.Decimal;
  cashOut: Prisma.Decimal;
}
