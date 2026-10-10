import type { CashClosingDto } from '@pos/contracts';
export function closingCashComponents(summary: CashClosingDto['summary']) {
  if (!('cashIn' in summary) && !('cashOut' in summary)) return { cashIn: '0.00', cashOut: '0.00' };
  if (
    !('cashIn' in summary) ||
    !('cashOut' in summary) ||
    typeof summary.cashIn !== 'string' ||
    typeof summary.cashOut !== 'string'
  )
    throw new Error('Sumarul închiderii este incomplet.');
  return { cashIn: summary.cashIn, cashOut: summary.cashOut };
}
