import type { TenantTransaction } from '@pos/db';
export type StoredCustomerAddress = Pick<
  Awaited<ReturnType<TenantTransaction['customerAddress']['findFirstOrThrow']>>,
  'id' | 'organizationId' | 'customerId' | 'version' | 'status' | 'privateDataEncrypted'
>;
