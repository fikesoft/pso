import type { TenantTransaction } from '../../src';
export type AddressRaceAction = (tx: TenantTransaction) => Promise<unknown>;
