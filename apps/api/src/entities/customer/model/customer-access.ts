import { assert } from '../../../shared/lib/http';
import type { CustomerAccessContext } from './customer.types';
export function requireCustomerAccess(context: CustomerAccessContext, create = false) {
  assert(context.visibleLocationIds.includes(context.locationId));
  const scope = {
    organizationId: context.organizationId,
    scopeType: 'ORGANIZATION' as const,
    locationId: null,
  };
  assert(context.canUse('customers.read', scope));
  if (create) assert(context.canUse('customers.create', scope));
}
