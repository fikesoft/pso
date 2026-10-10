import type { PackingCommandInput } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function packingCommandPermission(action: PackingCommandInput['action']) {
  return action === 'COMPLETE' ? 'packing.complete' : 'packing.update';
}

export function requirePackingPermission(
  access: AccessData,
  actorUserId: string,
  locationId: string,
  permission: 'packing.read' | 'packing.update' | 'packing.complete',
) {
  assert(
    access.service.canUse(
      actorUserId,
      permission,
      scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
    ),
  );
}
