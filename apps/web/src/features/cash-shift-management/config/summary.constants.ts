import { cashShiftMessages as text, cashMovementMessages as movement } from '@pos/ui/locales';
export const shiftSummaryFields = [
  ['cashCollected', text.cashCollected],
  ['cashRefunded', text.cashRefunded],
  ['cashIn', movement.cashIn],
  ['cashOut', movement.cashOut],
  ['expectedCash', text.expectedCash],
  ['cardCollected', text.cardCollected],
  ['cardRefunded', text.cardRefunded],
  ['cardNet', text.cardNet],
] as const;
