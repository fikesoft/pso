import { Router } from 'express';
import { endpoint, hasAny, permissionEntries } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { addCreateStaffRoutes } from './create.routes';
import { addUpdateStaffRoutes } from './update.routes';
import { addStaffCredentialRoutes } from './credentials.routes';
import { addStaffProfileRoutes } from './profile.routes';
import { staffUserResponse } from '../model/staff-response';

export function staffRouter() {
  const r = Router();
  r.get(
    '/staff',
    endpoint(async (_tx, d, a) => {
      assert(
        ['staff.read', 'staff.create', 'staff.manage', 'staff.credentials.reset'].some((key) =>
          hasAny(d, a.user.id, key),
        ),
      );
      const users = d.users
        .filter(
          (user) => user.id === a.user.id || d.service.canManageUser(a.user.id, user.id, 'read'),
        )
        .map((user) => ({
          ...staffUserResponse(user),
          managedByUserId: user.managedByUserId,
          locationIds: d.access
            .filter((access) => access.userId === user.id)
            .map((access) => access.locationId),
          assignments: d.assignments.filter(
            (assignment) => assignment.userId === user.id && !assignment.revokedAt,
          ),
          overrides: d.overrides
            .filter((override) => override.userId === user.id && !override.revokedAt)
            .map((override) => ({ ...override, ...permissionEntries([override])[0] })),
        }));
      return { users };
    }),
  );
  addCreateStaffRoutes(r);
  addUpdateStaffRoutes(r);
  addStaffCredentialRoutes(r);
  addStaffProfileRoutes(r);
  return r;
}
