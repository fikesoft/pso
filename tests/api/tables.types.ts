import type { BrowserSession } from './support/harness';
import type { prepareTables } from './tables-setup';

export type TablesFixture = Awaited<ReturnType<typeof prepareTables>>;
export interface TableActor {
  session: BrowserSession;
  userId: string;
  pin?: string;
  password?: string;
  login: string;
}
