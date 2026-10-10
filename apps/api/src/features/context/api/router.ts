import { Router } from 'express';
import { safeOrganization, safeUser } from '../../../entities/session';
import {
  endpoint,
  PERMISSIONS,
  publicLocation,
  scopeFor,
  visibleLocations,
} from '../../../entities/tenant-access';

export function contextRouter() {
  const r = Router();
  r.get(
    '/context',
    endpoint(async (_tx, d, a) => ({
      organization: safeOrganization(d.org),
      user: safeUser(a.user),
      locations: visibleLocations(d, a.user.id).map(publicLocation),
      permissions: [
        scopeFor(d.org.id, {}),
        ...visibleLocations(d, a.user.id).map((l) =>
          scopeFor(d.org.id, { scopeType: 'LOCATION', locationId: l.id }),
        ),
      ].flatMap((scope) =>
        PERMISSIONS.map((p) => ({
          permission: p.key,
          ...scope,
          canUse: d.service.canUse(a.user.id, p.key, scope),
          canGrant: d.service.canGrant(
            a.user.id,
            {
              id: 'preview',
              organizationId: d.org.id,
              status: 'ACTIVE',
              managedByUserId: a.user.id,
              locationIds: scope.locationId ? [scope.locationId] : [],
            },
            p.key,
            scope,
          ),
        })),
      ),
    })),
  );
  r.get(
    '/permissions',
    endpoint(async () => ({ permissions: PERMISSIONS })),
  );
  return r;
}
