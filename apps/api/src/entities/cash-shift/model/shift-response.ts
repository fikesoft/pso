import type {
  CashShiftDto,
  CashShiftSummary,
  CashClosingDto,
  CashFinancialSummaryV1,
} from '@pos/contracts';
import type {
  StoredCashShift,
  StoredCashClosing,
  StoredCashSummary,
  StoredCashSummaryV1,
} from './cash-shift.types';
export function shiftResponse(row: StoredCashShift): CashShiftDto {
  return {
    id: row.id,
    locationId: row.locationId,
    registerId: row.registerId,
    registerCode: row.registerCode,
    registerName: row.registerName,
    ownerUserId: row.ownerUserId,
    ownerDisplayName: row.ownerDisplayName,
    status: row.status as CashShiftDto['status'],
    version: row.version,
    openingAmount: row.openingAmount.toFixed(2),
    currency: 'MDL',
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}
function baseSummary(row: StoredCashSummaryV1): CashFinancialSummaryV1 {
  for (const count of [row.paidOrderCount, row.refundOperationCount])
    if (count > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Numărul operațiunilor depășește limita reprezentării.');
  return {
    cashCollected: row.cashCollected.toFixed(2),
    cashRefunded: row.cashRefunded.toFixed(2),
    expectedCash: row.expectedCash.toFixed(2),
    cardCollected: row.cardCollected.toFixed(2),
    cardRefunded: row.cardRefunded.toFixed(2),
    cardNet: row.cardNet.toFixed(2),
    paidOrderCount: Number(row.paidOrderCount),
    refundOperationCount: Number(row.refundOperationCount),
  };
}
export function shiftSummaryResponse(row: StoredCashSummary): CashShiftSummary {
  return { ...baseSummary(row), cashIn: row.cashIn.toFixed(2), cashOut: row.cashOut.toFixed(2) };
}
export function closingResponse(row: StoredCashClosing): CashClosingDto {
  return {
    id: row.id,
    shiftId: row.shiftId,
    shiftVersion: row.shiftVersion,
    expectedCash: row.expectedCash.toFixed(2),
    countedCash: row.countedCash.toFixed(2),
    difference: row.difference.toFixed(2),
    discrepancyReason: row.discrepancyReason,
    managerReason: row.managerReason,
    closedByUserId: row.closedByUserId,
    closedByDisplayName: row.closedByDisplayName,
    closedAt: row.closedAt.toISOString(),
    summary:
      row.cashIn === null && row.cashOut === null
        ? baseSummary(row)
        : {
            ...baseSummary(row),
            cashIn: row.cashIn!.toFixed(2),
            cashOut: row.cashOut!.toFixed(2),
          },
  };
}
