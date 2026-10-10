import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function requireKitchenPermission(
  access: AccessData,
  userId: string,
  locationId: string,
  permission: 'kitchen.read' | 'kitchen.update' | 'kitchen.courses.fire',
) {
  assert(
    access.service.canUse(
      userId,
      permission,
      scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
    ),
  );
}
