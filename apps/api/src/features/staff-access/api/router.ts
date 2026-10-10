import { assignmentSchema, createOverrideSchema, idSchema as uuid } from '@pos/contracts';
import { Router } from 'express';
import {
  addAssignment,
  audit,
  endpoint,
  moneyData,
  policyChanged,
  requireMfa,
  scopeFor,
  visibleLocations,
} from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function staffaccessRouter() {
  const r = Router();
  r.post(
    '/staff/:id/assignments',
    endpoint(async (tx, d, a, req) => {
      const id = uuid.parse(req.params.id);
      const body = assignmentSchema.parse(req.body);
      await addAssignment(tx, d, a, id, body);
      await audit(tx, a, req, 'staff.role.assigned', 'USER', id, body.locationId);
      return { saved: true };
    }),
  );
  r.delete(
    '/staff/:id/assignments/:assignmentId',
    endpoint(async (tx, d, a, req) => {
      const id = uuid.parse(req.params.id);
      const assignmentId = uuid.parse(req.params.assignmentId);
      const assignment = d.assignments.find(
        (entry) => entry.id === assignmentId && entry.userId === id && !entry.revokedAt,
      );
      assert(assignment, 404, 'Atribuire activă inexistentă');
      assert(d.service.canManageUser(a.user.id, id, 'assignPermissions'));
      if (a.user.id !== d.org.primaryAdminUserId) {
        assert(assignment.issuedByUserId === a.user.id);
        const scope = scopeFor(d.org.id, assignment);
        assert(
          scope.scopeType === 'LOCATION'
            ? visibleLocations(d, a.user.id).some((location) => location.id === scope.locationId)
            : d.service.canUse(a.user.id, 'staff.access', scope),
        );
      }
      await tx.userRoleAssignment.update({
        where: { id: assignmentId },
        data: { revokedAt: new Date() },
      });
      await policyChanged(tx, d.org.id, a.session.id);
      await audit(tx, a, req, 'staff.role.revoked', 'USER', id, assignment.locationId);
      return { saved: true };
    }),
  );
  r.post(
    '/staff/:id/overrides',
    endpoint(async (tx, d, a, req) => {
      const id = uuid.parse(req.params.id);
      const body = createOverrideSchema.parse(req.body);
      assert(d.service.canManageUser(a.user.id, id, 'assignPermissions'));
      const scope = scopeFor(d.org.id, body);
      let delegationGrantId: string | null = null;
      if (body.effect === 'DENY') {
        // Company-wide prohibition of a local permission is intentional. Only the
        // principal may establish it, and no delegated actor can remove it later.
        assert(a.user.id === d.org.primaryAdminUserId);
        if (scope.scopeType === 'LOCATION')
          assert(
            d.locations.some(
              (location) => location.id === scope.locationId && location.status === 'ACTIVE',
            ),
          );
      } else {
        const decision = d.service.grantSource(a.user.id, id, body.permission, scope, body.limits);
        assert(decision.allowed);
        delegationGrantId = decision.delegationGrantId;
      }
      const override = await tx.userPermissionOverride.create({
        data: {
          organizationId: d.org.id,
          userId: id,
          permissionKey: body.permission,
          effect: body.effect,
          scopeType: body.scopeType,
          locationId: body.locationId,
          issuedByUserId: a.user.id,
          delegationGrantId,
          ...moneyData(body),
        },
      });
      if (body.effect === 'ALLOW') await requireMfa(tx, id, [body]);
      await policyChanged(tx, d.org.id, a.session.id);
      await audit(tx, a, req, 'staff.override.created', 'USER', id, body.locationId);
      return { override };
    }),
  );
  r.delete(
    '/staff/:id/overrides/:overrideId',
    endpoint(async (tx, d, a, req) => {
      const id = uuid.parse(req.params.id);
      const overrideId = uuid.parse(req.params.overrideId);
      const override = d.overrides.find(
        (o) => o.id === overrideId && o.userId === id && !o.revokedAt,
      );
      assert(override, 404);
      assert(
        d.service.canManageUser(
          a.user.id,
          id,
          override.effect === 'DENY' ? 'removeDeny' : 'assignPermissions',
        ),
      );
      assert(a.user.id === d.org.primaryAdminUserId || override.issuedByUserId === a.user.id);
      await tx.userPermissionOverride.update({
        where: { id: overrideId },
        data: { revokedAt: new Date() },
      });
      await policyChanged(tx, d.org.id, a.session.id);
      await audit(tx, a, req, 'staff.override.revoked', 'USER', id, override.locationId);
      return { saved: true };
    }),
  );
  return r;
}
