import type { prepareCashShifts } from './cash-shifts-setup';
import type { BrowserSession } from './support/harness';

export type CashShiftsFixture = Awaited<ReturnType<typeof prepareCashShifts>>;
export interface CashShiftActor {
  session: BrowserSession;
  userId: string;
  pin: string;
}
