import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function attendanceLocation(
  access: AccessData,
  locationId: string,
  actorId: string,
  permission: 'attendance.clock' | 'attendance.read',
) {
  const location = access.locations.find(
    (entry) => entry.id === locationId && entry.status === 'ACTIVE',
  );
  assert(location, 404, 'Locația nu există sau este inactivă.');
  assert(
    access.service.canUse(
      actorId,
      permission,
      scopeFor(access.org.id, {
        scopeType: 'LOCATION',
        locationId,
      }),
    ),
  );
  return location;
}

export function readableUser(
  access: AccessData,
  actorId: string,
  targetId: string,
  locationId: string,
) {
  assert(
    access.users.some((user) => user.id === targetId),
    404,
    'Utilizatorul nu există.',
  );
  if (targetId === actorId) {
    const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
    assert(
      access.service.canUse(actorId, 'attendance.clock', scope) ||
        access.service.canUse(actorId, 'attendance.read', scope),
    );
    return;
  }
  attendanceLocation(access, locationId, actorId, 'attendance.read');
  assert(access.service.canManageUser(actorId, targetId, 'read'));
}
