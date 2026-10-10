import type { BrowserSession } from './support/harness';
import type { prepareOperations } from './operations-setup';

export type MfaRaceFixture = Awaited<ReturnType<typeof prepareOperations>>;
export interface MfaRaceTarget {
  kind: 'TENANT' | 'PLATFORM';
  session: BrowserSession;
  userId: string;
  organizationId?: string;
  credentialId: string;
  secret: string;
  password: string;
}
