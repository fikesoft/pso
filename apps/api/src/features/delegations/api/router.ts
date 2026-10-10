import { createDelegationSchema, revokeDelegationSchema, idSchema as uuid } from '@pos/contracts';
import { Router } from 'express';
import {
  audit,
  endpoint,
  moneyData,
  permissionEntries,
  PERMISSIONS,
  policyChanged,
  requireAdministrativeAuthentication,
  scopeFor,
} from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function delegationsRouter() {
  const r = Router();
  r.get(
    '/delegations',
    endpoint(async (_tx, d, a) => ({
      grants: d.grants
        .filter((g) => a.user.id === d.org.primaryAdminUserId || g.userId === a.user.id)
        .map((g) => ({
          ...g,
          permissions: permissionEntries(d.gp.filter((p) => p.delegationGrantId === g.id)),
        })),
    })),
  );
  r.post(
    '/delegations',
    endpoint(async (tx, d, a, req) => {
      const body = createDelegationSchema.parse(req.body);
      assert(a.user.id === d.org.primaryAdminUserId);
      assert(d.service.canManageUser(a.user.id, body.userId, 'setDelegation'));
      const scope = scopeFor(d.org.id, body);
      for (const p of body.permissions) {
        assert(
          PERMISSIONS.some((x) => x.key === p.permission && x.delegable),
          403,
        );
        assert(d.service.canGrant(a.user.id, body.userId, p.permission, scope, p.limits));
      }
      const grant = await tx.delegationGrant.create({
        data: {
          organizationId: d.org.id,
          userId: body.userId,
          issuedByUserId: a.user.id,
          scopeType: body.scopeType,
          locationId: body.locationId,
        },
      });
      await tx.delegationGrantPermission.createMany({
        data: body.permissions.map((p) => ({
          organizationId: d.org.id,
          delegationGrantId: grant.id,
          permissionKey: p.permission,
          ...moneyData(p),
        })),
      });
      await requireAdministrativeAuthentication(tx, body.userId);
      await policyChanged(tx, d.org.id, a.session.id);
      await audit(tx, a, req, 'delegations.created', 'GRANT', grant.id, body.locationId);
      return { grant };
    }),
  );
  r.post(
    '/delegations/:id/revoke',
    endpoint(async (tx, d, a, req) => {
      const id = uuid.parse(req.params.id);
      const { reason } = revokeDelegationSchema.parse(req.body);
      const grant = d.grants.find((g) => g.id === id);
      assert(grant, 404);
      assert(a.user.id === d.org.primaryAdminUserId);
      assert(d.service.canManageUser(a.user.id, grant.userId, 'setDelegation'));
      await tx.delegationGrant.update({
        where: { id },
        data: { status: 'REVOKED', revokedAt: new Date(), reason, version: { increment: 1 } },
      });
      await policyChanged(tx, d.org.id, a.session.id);
      await audit(tx, a, req, 'delegations.revoked', 'GRANT', id, grant.locationId);
      return { saved: true };
    }),
  );
  return r;
}
