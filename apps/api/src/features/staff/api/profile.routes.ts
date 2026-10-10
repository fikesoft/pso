import { employeeProfileQuerySchema, idSchema } from '@pos/contracts';
import type { EmployeeProfileResponse } from '@pos/contracts';
import type { Router } from 'express';
import { endpoint, scopeFor } from '../../../entities/tenant-access';
import { avatarUrl } from '../../../entities/file-assets';
import { assert } from '../../../shared/lib/http';
import { profileAttendance } from '../model/profile-attendance';
import { profilePerformance } from '../model/profile-performance';
import { profileScope } from '../model/profile-scope';
import { profileSessions } from '../model/profile-sessions';

export function addStaffProfileRoutes(router: Router) {
  router.get(
    '/staff/:id/profile',
    endpoint(async (tx, access, auth, req, res): Promise<EmployeeProfileResponse> => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id);
      const query = employeeProfileQuerySchema.parse(req.query);
      const user = access.users.find((entry) => entry.id === id);
      assert(user, 404);
      assert(id === auth.user.id || access.service.canManageUser(auth.user.id, id, 'read'));
      const scope = await profileScope(tx, access, id, query);
      const roleVersions = access.versions.filter((entry) =>
        access.assignments.some(
          (assignment) => assignment.userId === id && assignment.roleVersionId === entry.id,
        ),
      );
      const roles = roleVersions.length
        ? await tx.role.findMany({
            where: { id: { in: roleVersions.map((entry) => entry.roleId) } },
          })
        : [];
      const attendancePermission = id === auth.user.id ? 'attendance.clock' : 'attendance.read';
      const canReadAttendance =
        scope.locationIds.length > 0 &&
        scope.locationIds.every((locationId) =>
          access.service.canUse(
            auth.user.id,
            attendancePermission,
            scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
          ),
        );
      const [attendance, performance, sessions] = await Promise.all([
        canReadAttendance ? profileAttendance(tx, access.org.id, id, scope) : Promise.resolve(null),
        profilePerformance(tx, access, auth.user.id, id, scope),
        profileSessions(tx, access, auth, id),
      ]);
      return {
        profile: {
          user: {
            id: user.id,
            organizationId: user.organizationId,
            login: user.loginNormalized,
            displayName: user.displayName,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            email: user.email,
            employeeCode: user.employeeCode,
            hireDate: user.hireDate?.toISOString().slice(0, 10) ?? null,
            avatarUrl: avatarUrl(user.id, user.avatarAssetId),
            status: user.status,
            version: user.version,
          },
          locations: scope.assignedLocationIds.flatMap((locationId) => {
            const location = access.locations.find((item) => item.id === locationId);
            return location ? [{ id: location.id, code: location.code, name: location.name }] : [];
          }),
          roles: access.assignments
            .filter((entry) => entry.userId === id && !entry.revokedAt)
            .flatMap((entry) => {
              const version = roleVersions.find((item) => item.id === entry.roleVersionId);
              const role = roles.find((item) => item.id === version?.roleId);
              return version && role
                ? [
                    {
                      assignmentId: entry.id,
                      roleId: role.id,
                      roleName: role.name,
                      roleVersion: version.version,
                      scopeType: entry.scopeType,
                      locationId: entry.locationId,
                    },
                  ]
                : [];
            }),
          attendance,
          performance,
          sessions,
          scope: {
            locationIds: scope.locationIds,
            from: scope.from,
            to: scope.to,
            timezone: scope.timezone,
          },
        },
      };
    }),
  );
}
