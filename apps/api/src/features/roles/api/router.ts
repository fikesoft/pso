import type { AuthzUser } from '@pos/authz';
import { createRoleSchema, roleVersionSchema, idSchema as uuid } from '@pos/contracts';
import { Router } from 'express';
import {
  audit,
  endpoint,
  hasAny,
  permissionEntries,
  scopeFor,
  visibleLocations,
} from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { createRoleVersion } from '../model/create-role-version';

export function rolesRouter() {
  const r = Router();
  r.get(
    '/roles',
    endpoint(async (tx, d, a) => {
      assert(hasAny(d, a.user.id, 'roles.read') || hasAny(d, a.user.id, 'staff.create'));
      const allRoles = await tx.role.findMany({ orderBy: { name: 'asc' } });
      const organizationRead = d.service.canUse(a.user.id, 'roles.read', scopeFor(d.org.id, {}));
      const roles = allRoles
        .map((role) => ({
          ...role,
          versions: d.versions
            .filter((version) => version.roleId === role.id)
            .map((version) => ({
              ...version,
              permissions: permissionEntries(
                d.rp.filter((entry) => entry.roleVersionId === version.id),
              ),
            }))
            .filter(
              (version) =>
                organizationRead ||
                visibleLocations(d, a.user.id).some((location) => {
                  const scope = scopeFor(d.org.id, {
                    scopeType: 'LOCATION',
                    locationId: location.id,
                  });
                  const target: AuthzUser = {
                    id: 'prospective-worker',
                    organizationId: d.org.id,
                    status: 'ACTIVE',
                    managedByUserId: a.user.id,
                    locationIds: [location.id],
                  };
                  return (
                    (d.service.canUse(a.user.id, 'roles.read', scope) ||
                      d.service.canUse(a.user.id, 'staff.create', scope)) &&
                    version.permissions.every((entry) =>
                      d.service.canGrant(a.user.id, target, entry.permission, scope, entry.limits),
                    )
                  );
                }),
            ),
        }))
        .filter((role) => organizationRead || role.versions.length > 0);
      return { roles };
    }),
  );
  r.post(
    '/roles',
    endpoint(async (tx, d, a, req) => {
      assert(d.service.canUse(a.user.id, 'roles.manage', scopeFor(d.org.id, {})));
      const body = createRoleSchema.parse(req.body);
      const role = await tx.role.create({
        data: {
          organizationId: d.org.id,
          name: body.name,
          description: body.description,
          createdByUserId: a.user.id,
        },
      });
      const version = await createRoleVersion(tx, d, a, role.id, body.permissions);
      await audit(tx, a, req, 'roles.created', 'ROLE', role.id);
      return { role: { ...role, versions: [version] } };
    }),
  );
  r.post(
    '/roles/:id/versions',
    endpoint(async (tx, d, a, req) => {
      const id = uuid.parse(req.params.id);
      assert(await tx.role.findUnique({ where: { id } }), 404);
      const body = roleVersionSchema.parse(req.body);
      const version = await createRoleVersion(tx, d, a, id, body.permissions);
      await audit(tx, a, req, 'roles.version.created', 'ROLE', id);
      return { version };
    }),
  );
  return r;
}
