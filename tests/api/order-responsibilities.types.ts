import type { BrowserSession } from './support/harness';
import type { prepareOrderResponsibilities } from './order-responsibilities-setup';
export type ResponsibilityFixture = Awaited<ReturnType<typeof prepareOrderResponsibilities>>;
export interface ResponsibilityActor {
  session: BrowserSession;
  userId: string;
  login: string;
  pin?: string;
  password?: string;
  secret?: string;
}
