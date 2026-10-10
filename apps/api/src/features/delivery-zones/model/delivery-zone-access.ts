import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor, visibleLocations } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
export function requireDeliveryZoneAccess(
  access: AccessData,
  actor: string,
  locationId: string,
  manage = false,
) {
  assert(visibleLocations(access, actor).some((location) => location.id === locationId));
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
  assert(access.service.canUse(actor, 'delivery.zones.read', scope));
  if (manage) assert(access.service.canUse(actor, 'delivery.zones.manage', scope));
}
