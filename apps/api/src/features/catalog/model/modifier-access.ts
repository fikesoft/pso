import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function requireModifierRead(
  access: AccessData,
  userId: string,
  locationId: string,
  includeArchived = false,
) {
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
  const canRead = access.service.canUse(userId, 'catalog.read', scope);
  const canManage = access.service.canUse(userId, 'catalog.manage', scope);
  assert(canRead || canManage || access.service.canUse(userId, 'orders.create', scope));
  if (includeArchived) {
    assert(canRead || canManage);
    requireModifierManage(access, userId);
  }
}

export function requireModifierManage(access: AccessData, userId: string) {
  assert(access.service.canUse(userId, 'catalog.manage', scopeFor(access.org.id, {})));
}
