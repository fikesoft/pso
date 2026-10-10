import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { requireShiftRead } from '../../../entities/cash-shift';
import { assert } from '../../../shared/lib/http';
export function requireDiscrepancyAccess(access: AccessData, actor: string, locationId: string) {
  requireShiftRead(access.service, access.org.id, actor, locationId);
  assert(
    access.service.canUse(
      actor,
      'cash.reports.read',
      scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
    ),
  );
  const location = access.locations.find((row) => row.id === locationId);
  assert(location, 404, 'Locația nu există');
  return location.timezone;
}
