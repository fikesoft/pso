export const CASH_MOVEMENT_DIRECTIONS = ['IN', 'OUT'] as const;
export const CASH_DRAWER_KINDS = ['CASH_IN', 'CASH_OUT'] as const;
export const CASH_MOVEMENT_KINDS = ['OPENING', 'PAYMENT', 'REFUND', ...CASH_DRAWER_KINDS] as const;
