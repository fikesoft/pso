import { AuthorizationService } from '@pos/authz';
import type { AuthzUser, PermissionOverride } from '@pos/authz';
import { accessPreviewSchema } from '@pos/contracts';
import { Router } from 'express';
import { endpoint, PERMISSIONS, scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function accessRouter() {
  const r = Router();
  r.post(
    '/access/preview',
    endpoint(async (_tx, d, a, req) => {
      const body = accessPreviewSchema.parse(req.body);
      const userId = body.userId ?? a.user.id;
      if (userId !== a.user.id)
        assert(d.service.canManageUser(a.user.id, userId, 'assignPermissions'));
      const scope = scopeFor(d.org.id, body);
      const target: AuthzUser | string = body.userId ?? {
        id: 'prospective-worker',
        organizationId: d.org.id,
        status: 'ACTIVE',
        managedByUserId: a.user.id,
        locationIds: scope.locationId ? [scope.locationId] : [],
      };
      const targetId = typeof target === 'string' ? target : target.id;
      const proposedOverrides: PermissionOverride[] = [];
      for (const entry of body.permissions ?? []) {
        const decision = d.service.grantSource(
          a.user.id,
          target,
          entry.permission,
          scope,
          entry.limits,
        );
        const primaryDeny =
          body.effect === 'DENY' &&
          a.user.id === d.org.primaryAdminUserId &&
          targetId !== a.user.id;
        if (decision.allowed || primaryDeny)
          proposedOverrides.push({
            id: `preview-${entry.permission}`,
            userId: targetId,
            ...scope,
            permission: entry.permission,
            limits: entry.limits,
            effect: body.effect ?? 'ALLOW',
            issuerUserId: a.user.id,
            delegationGrantId: decision.delegationGrantId,
          });
      }
      const proposed = new AuthorizationService({
        ...d.snapshot,
        users: typeof target === 'string' ? d.snapshot.users : [...d.snapshot.users, target],
        overrides: [...d.snapshot.overrides, ...proposedOverrides],
      });
      return {
        entries: PERMISSIONS.map((permission) => ({
          permission: permission.key,
          label: permission.label,
          canUse:
            !body.permissions || body.userId
              ? d.service.canUse(userId, permission.key, scope)
              : false,
          proposedCanUse: body.permissions
            ? proposed.canUse(targetId, permission.key, scope)
            : undefined,
          canGrant: d.service.canGrant(
            a.user.id,
            target,
            permission.key,
            scope,
            body.permissions?.find((entry) => entry.permission === permission.key)?.limits,
          ),
          source: body.userId
            ? d.service.explainUse(userId, permission.key, scope).join(' · ')
            : 'Cont nou — fără drepturi înainte de atribuire',
        })),
      };
    }),
  );
  return r;
}
