import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function canInventoryOrganization(access: AccessData, userId: string, permission: string) {
  return access.service.canUse(userId, permission, scopeFor(access.org.id, {}));
}
export function requireInventoryOrganization(
  access: AccessData,
  userId: string,
  permission: string,
) {
  assert(canInventoryOrganization(access, userId, permission));
}
export function canInventoryLocation(
  access: AccessData,
  userId: string,
  locationId: string,
  permission: string,
) {
  assert(
    access.locations.some((location) => location.id === locationId && location.status === 'ACTIVE'),
    404,
    'Locația nu există sau este arhivată',
  );
  return access.service.canUse(
    userId,
    permission,
    scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
  );
}
export function requireInventoryStock(
  access: AccessData,
  userId: string,
  locationId: string,
  write = false,
) {
  assert(
    canInventoryLocation(access, userId, locationId, 'inventory.manage') ||
      (!write && canInventoryLocation(access, userId, locationId, 'inventory.read')),
  );
}
/** Metadata is organization-wide; balance disclosure always requires location permission. */
export function inventoryItemVisibility(access: AccessData, userId: string, locationId?: string) {
  const balance =
    !!locationId &&
    (canInventoryLocation(access, userId, locationId, 'inventory.read') ||
      canInventoryLocation(access, userId, locationId, 'inventory.manage'));
  assert(
    balance ||
      canInventoryOrganization(access, userId, 'inventory.recipes.manage') ||
      canInventoryOrganization(access, userId, 'inventory.manage'),
  );
  return balance ? locationId! : null;
}
