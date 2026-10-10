import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function requireWebsiteManagement(access: AccessData, userId: string) {
  assert(
    userId === access.org.primaryAdminUserId &&
      access.currentUser.isPrimaryAdmin &&
      access.service.canUse(userId, 'website.integrations.manage', scopeFor(access.org.id, {})),
  );
}
export function requireWebsiteOrderAccess(
  access: AccessData,
  userId: string,
  locationId: string,
  total?: string,
  write = false,
) {
  const scope = {
    ...scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
    ...(total === undefined ? {} : { amount: total }),
  };
  assert(access.service.canUse(userId, 'orders.read', scope));
  if (write) assert(access.service.canUse(userId, 'orders.create', scope));
}
