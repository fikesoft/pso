import type { BrowserSession } from './support/harness';
import type { prepareCashRegisters } from './cash-registers-setup';

export interface RegisterActor {
  session: BrowserSession;
  id: string;
  login: string;
  password: string;
  secret?: string;
}
export type CashRegistersFixture = Awaited<ReturnType<typeof prepareCashRegisters>>;
