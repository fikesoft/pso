import type { TenantTransaction } from '../../src/index';
import type { createOperationsFixture } from './operations.fixture';

export type OperationsFixture = Awaited<ReturnType<typeof createOperationsFixture>>;
export type OperationsDraft = Awaited<ReturnType<OperationsFixture['createDraft']>>;
export type KitchenFixtureOptions = {
  omitItems?: boolean;
  omitReservation?: boolean;
  afterSend?: (tx: TenantTransaction) => Promise<void>;
  leaveDraft?: boolean;
  locationId?: string;
  orderItemId?: string;
  productName?: string;
  alertIdentity?: { productId: string; categoryId: string; categorySnapshotKnown: boolean };
};
export type OperationsRlsStatus = {
  tableName: string;
  enabled: boolean;
  forced: boolean;
};
