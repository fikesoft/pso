import type { TenantTransaction } from '@pos/db';
export type ManagedCustomer = Awaited<
  ReturnType<TenantTransaction['customer']['findFirstOrThrow']>
>;
export type CustomerCommandRow = Awaited<
  ReturnType<TenantTransaction['customerCommand']['findFirstOrThrow']>
>;
export interface CustomerCursorContext {
  organizationId: string;
  actorUserId: string;
  locationId: string;
  status: string;
  field: string | null;
  queryHash: string | null;
}
