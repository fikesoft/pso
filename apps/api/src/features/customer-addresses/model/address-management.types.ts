import type { TenantTransaction } from '@pos/db';
export type ManagedAddress = Awaited<
  ReturnType<TenantTransaction['customerAddress']['findFirstOrThrow']>
>;
export type AddressCommandRow = Awaited<
  ReturnType<TenantTransaction['customerAddressCommand']['findFirstOrThrow']>
>;
export type AddressCustomer = Pick<
  Awaited<ReturnType<TenantTransaction['customer']['findFirstOrThrow']>>,
  'id' | 'organizationId' | 'status'
>;
