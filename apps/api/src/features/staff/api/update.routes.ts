import { updateStaffSchema, idSchema as uuid } from '@pos/contracts';
import type { Router } from 'express';
import { audit, endpoint, policyChanged, visibleLocations } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { staffUserResponse } from '../model/staff-response';

export function addUpdateStaffRoutes(r: Router) {
  r.patch(
    '/staff/:id',
    endpoint(async (tx, d, a, req) => {
      const id = uuid.parse(req.params.id);
      const body = updateStaffSchema.parse(req.body);
      assert(
        d.service.canManageUser(
          a.user.id,
          id,
          body.status === 'DISABLED' ? 'deactivate' : 'update',
        ),
      );
      const target = d.users.find((u) => u.id === id);
      assert(target, 404);
      assert(target.version === body.version, 409, 'Utilizatorul a fost modificat. Reîncărcați.');
      if (body.locationIds) {
        const prior = d.snapshot.users.find((user) => user.id === id)!;
        const prospective = { ...prior, locationIds: body.locationIds };
        assert(d.service.canManageUser(a.user.id, prospective, 'update'));
        if (a.user.id !== d.org.primaryAdminUserId)
          assert(
            body.locationIds.every((locationId) => prior.locationIds.includes(locationId)),
            403,
            'Adăugarea unei locații existente necesită administratorul principal',
          );
        for (const loc of body.locationIds) {
          assert(d.locations.some((l) => l.id === loc && l.status === 'ACTIVE'));
          assert(
            a.user.id === d.org.primaryAdminUserId ||
              visibleLocations(d, a.user.id).some((l) => l.id === loc),
          );
        }
        await tx.userLocationAccess.deleteMany({ where: { userId: id } });
        await tx.userLocationAccess.createMany({
          data: [...new Set(body.locationIds)].map((locationId, i) => ({
            organizationId: d.org.id,
            userId: id,
            locationId,
            isDefault: i === 0,
          })),
        });
      }
      const user = await tx.companyUser.update({
        where: { id },
        data: {
          displayName: body.displayName,
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone,
          email: body.email,
          employeeCode: body.employeeCode,
          hireDate:
            body.hireDate === undefined
              ? undefined
              : body.hireDate === null
                ? null
                : new Date(`${body.hireDate}T00:00:00.000Z`),
          status: body.status,
          version: { increment: 1 },
          authVersion: { increment: 1 },
        },
      });
      await tx.tenantSession.updateMany({ where: { userId: id }, data: { revokedAt: new Date() } });
      await policyChanged(tx, d.org.id, a.session.id);
      await audit(tx, a, req, 'staff.updated', 'USER', id);
      return { user: staffUserResponse(user) };
    }),
  );
}
