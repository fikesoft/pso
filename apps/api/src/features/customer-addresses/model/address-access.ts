import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { visibleLocations, scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
export async function requireAddressAccess(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  customerId: string,
  locationId: string,
  manage = false,
) {
  assert(visibleLocations(access, actor).some((location) => location.id === locationId));
  const scope = scopeFor(access.org.id, {});
  assert(access.service.canUse(actor, 'customers.read', scope));
  if (manage) assert(access.service.canUse(actor, 'customers.addresses.manage', scope));
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  assert(customer, 404, 'Clientul nu există');
  return customer;
}
