import type { AuthzUser } from '@pos/authz';
import { createStaffSchema } from '@pos/contracts';
import type { Router } from 'express';
import { hashPassword, temporaryPassword } from '../../../entities/session';
import {
  addAssignment,
  audit,
  endpoint,
  loadAccess,
  scopeFor,
  visibleLocations,
} from '../../../entities/tenant-access';
import { config, HOUR_MS } from '../../../shared/config';
import { assert } from '../../../shared/lib/http';
import { configureStaffPin } from '../model/staff-pin';
import { staffUserResponse } from '../model/staff-response';

export function addCreateStaffRoutes(r: Router) {
  r.post(
    '/staff',
    endpoint(async (tx, d, a, req) => {
      const body = createStaffSchema.parse(req.body);
      const primary = a.user.id === d.org.primaryAdminUserId;
      const manager = primary ? (body.managedByUserId ?? a.user.id) : a.user.id;
      assert(primary || !body.managedByUserId || body.managedByUserId === a.user.id);
      assert(d.users.some((u) => u.id === manager && u.status === 'ACTIVE'));
      for (const id of body.locationIds) {
        assert(
          d.locations.some((l) => l.id === id && l.status === 'ACTIVE'),
          404,
        );
        assert(
          d.service.canUse(
            a.user.id,
            'staff.create',
            scopeFor(d.org.id, { scopeType: 'LOCATION', locationId: id }),
          ) || d.service.canUse(a.user.id, 'staff.create', scopeFor(d.org.id, {})),
        );
        if (!primary) assert(visibleLocations(d, a.user.id).some((l) => l.id === id));
      }
      const prospective: AuthzUser = {
        id: 'prospective-worker',
        organizationId: d.org.id,
        status: 'ACTIVE',
        managedByUserId: manager,
        locationIds: body.locationIds,
      };
      assert(d.service.canManageUser(a.user.id, prospective, 'create'));
      const password = body.password ?? temporaryPassword();
      const user = await tx.companyUser.create({
        data: {
          organizationId: d.org.id,
          loginNormalized: body.login,
          displayName: body.displayName,
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone,
          email: body.email,
          employeeCode: body.employeeCode,
          hireDate: body.hireDate ? new Date(`${body.hireDate}T00:00:00.000Z`) : body.hireDate,
          passwordHash: await hashPassword(password),
          temporaryPasswordExpiresAt: new Date(Date.now() + config.TEMP_PASSWORD_HOURS * HOUR_MS),
          createdByUserId: a.user.id,
          managedByUserId: manager,
        },
      });
      await tx.userLocationAccess.createMany({
        data: [...new Set(body.locationIds)].map((locationId, i) => ({
          organizationId: d.org.id,
          userId: user.id,
          locationId,
          isDefault: i === 0,
        })),
      });
      const refreshed = await loadAccess(tx, a);
      for (const assignment of body.assignments ?? [])
        await addAssignment(tx, refreshed, a, user.id, assignment);
      if (body.authenticationMethod === 'PIN') {
        const configured = await configureStaffPin(tx, d.org.id, user.id, body.pin);
        await audit(tx, a, req, 'staff.created', 'USER', user.id);
        return { user: staffUserResponse(configured.user), pin: configured.pin };
      }
      await audit(tx, a, req, 'staff.created', 'USER', user.id);
      const current = await tx.companyUser.findUniqueOrThrow({ where: { id: user.id } });
      return { user: staffUserResponse(current), temporaryPassword: password };
    }),
  );
}
