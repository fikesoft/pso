import type { Scope } from '@pos/authz';
import type { TenantTransaction } from '@pos/db';
export type StoredCustomer = Pick<
  Awaited<ReturnType<TenantTransaction['customer']['findFirstOrThrow']>>,
  'id' | 'organizationId' | 'version' | 'privateDataEncrypted'
>;
export interface CustomerAccessContext {
  organizationId: string;
  locationId: string;
  visibleLocationIds: string[];
  canUse: (permission: string, scope: Scope) => boolean;
}
