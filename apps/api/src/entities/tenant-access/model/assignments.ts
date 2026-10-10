import type { AssignmentRequest } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { TenantAuthState } from '../../../shared/lib/http';
import { assert } from '../../../shared/lib/http';
import type { AccessData } from './access.types';
import { scopeFor } from './load-access';
import { policyChanged, requireMfa } from './mutations';
export async function addAssignment(
  tx: TenantTransaction,
  d: AccessData,
  auth: TenantAuthState,
  userId: string,
  body: AssignmentRequest,
) {
  const scope = scopeFor(d.org.id, body);
  const version = d.snapshot.roleVersions.find((entry) => entry.id === body.roleVersionId);
  const persistedVersion = d.versions.find((entry) => entry.id === body.roleVersionId);
  assert(version && persistedVersion, 404, 'Versiune de rol inexistentă');
  assert(d.service.canManageUser(auth.user.id, userId, 'assignPermissions'));
  let delegationGrantId: string | null = null;
  // Validate the entire proposed version before withdrawing any existing access.
  for (const entry of version.permissions) {
    const decision = d.service.grantSource(
      auth.user.id,
      userId,
      entry.permission,
      scope,
      entry.limits,
    );
    assert(decision.allowed);
    if (decision.delegationGrantId) {
      assert(
        !delegationGrantId || delegationGrantId === decision.delegationGrantId,
        403,
        'Rolul trebuie să respecte un singur plafon',
      );
      delegationGrantId = decision.delegationGrantId;
    }
  }
  // Reassignment replaces this role only, at this exact user/scope/location.
  // Query the transaction so repeated assignments in a create-staff request also
  // see writes performed earlier in that same transaction. Keep historical rows.
  const roleVersionIds = d.versions
    .filter((entry) => entry.roleId === persistedVersion.roleId)
    .map((entry) => entry.id);
  await tx.userRoleAssignment.updateMany({
    where: {
      organizationId: d.org.id,
      userId,
      roleVersionId: { in: roleVersionIds },
      scopeType: scope.scopeType,
      locationId: scope.locationId ?? null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  await tx.userRoleAssignment.create({
    data: {
      organizationId: d.org.id,
      userId,
      roleVersionId: version.id,
      scopeType: scope.scopeType,
      locationId: scope.locationId,
      issuedByUserId: auth.user.id,
      delegationGrantId,
    },
  });
  await requireMfa(tx, userId, version.permissions);
  await policyChanged(tx, d.org.id, auth.session.id);
}
