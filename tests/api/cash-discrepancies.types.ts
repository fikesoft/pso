import type { prepareCashDiscrepancies } from './cash-discrepancies-setup';
export type CashDiscrepanciesFixture = Awaited<ReturnType<typeof prepareCashDiscrepancies>>;
