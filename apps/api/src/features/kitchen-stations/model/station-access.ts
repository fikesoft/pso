import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor, visibleLocations } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
export function requireStationAccess(
  access: AccessData,
  actor: string,
  locationId: string,
  manage = false,
) {
  assert(
    visibleLocations(access, actor).some(
      (location) => location.id === locationId && location.status === 'ACTIVE',
    ),
  );
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
  assert(access.service.canUse(actor, 'kitchen.read', scope));
  if (manage) assert(access.service.canUse(actor, 'kitchen.stations.manage', scope));
}
