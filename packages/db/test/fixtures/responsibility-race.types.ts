import type { TenantTransaction } from '../../src';
export interface ResponsibilityRaceOptions {
  organizationId: string;
  actor: string;
  isolationLevel: 'ReadCommitted' | 'RepeatableRead';
  snapshot(tx: TenantTransaction): Promise<unknown>;
  winner(tx: TenantTransaction): Promise<unknown>;
  loser(tx: TenantTransaction): Promise<unknown>;
}
