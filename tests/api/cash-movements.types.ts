import type { prepareCashMovements } from './cash-movements-setup';
export type CashMovementsFixture = Awaited<ReturnType<typeof prepareCashMovements>>;
