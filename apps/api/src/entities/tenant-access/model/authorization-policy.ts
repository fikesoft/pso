import type {
  AuthzLocation,
  AuthzUser,
  DelegationGrant,
  PermissionOverride,
  ScopeType,
} from '@pos/authz';
import { AuthorizationService } from '@pos/authz';
import type { AuthorizationSnapshot } from '@pos/authz';
import type { TenantTransaction } from '@pos/db';
import type { PermissionRow, ScopeRow } from './access.types';
export const permissionEntries = (rows: readonly PermissionRow[]) =>
  rows.map((p) => ({
    permission: p.permissionKey,
    limits: {
      ...(p.maxAmount !== null && p.maxAmount !== undefined
        ? { maxAmount: String(p.maxAmount) }
        : {}),
      ...(p.maxPercent !== null && p.maxPercent !== undefined
        ? { maxPercent: String(p.maxPercent) }
        : {}),
    },
  }));
export async function loadAuthorization(tx: TenantTransaction, organizationId: string) {
  const [org, users, locations, access, versions, rp, assignments, overrides, grants, gp] =
    await Promise.all([
      tx.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      tx.companyUser.findMany(),
      tx.location.findMany(),
      tx.userLocationAccess.findMany(),
      tx.roleVersion.findMany(),
      tx.rolePermission.findMany(),
      tx.userRoleAssignment.findMany(),
      tx.userPermissionOverride.findMany(),
      tx.delegationGrant.findMany(),
      tx.delegationGrantPermission.findMany(),
    ]);
  const scope = (row: ScopeRow) => ({
    organizationId: row.organizationId,
    scopeType: row.scopeType as ScopeType,
    locationId: row.locationId,
    issuerUserId: row.issuedByUserId,
  });
  const snapshot: AuthorizationSnapshot = {
    organizationId: org.id,
    primaryAdminUserId: org.primaryAdminUserId!,
    users: users.map((u) => ({
      id: u.id,
      organizationId: u.organizationId,
      status: u.status as AuthzUser['status'],
      managedByUserId: u.managedByUserId,
      locationIds: access.filter((a) => a.userId === u.id).map((a) => a.locationId),
    })),
    locations: locations.map((location) => ({
      ...location,
      status: location.status as AuthzLocation['status'],
    })),
    roleVersions: versions.map((v) => ({
      ...v,
      permissions: permissionEntries(rp.filter((p) => p.roleVersionId === v.id)),
    })),
    assignments: assignments.map((a) => ({ ...a, ...scope(a) })),
    overrides: overrides.map((o) => ({
      ...o,
      ...scope(o),
      ...permissionEntries([o])[0],
      effect: o.effect as PermissionOverride['effect'],
    })),
    delegations: grants.map((g) => ({
      ...g,
      ...scope(g),
      status: g.status as DelegationGrant['status'],
      permissions: permissionEntries(gp.filter((p) => p.delegationGrantId === g.id)),
    })),
  };
  const service = new AuthorizationService(snapshot);
  return {
    service,
    snapshot,
    org,
    users,
    locations,
    access,
    versions,
    rp,
    assignments,
    overrides,
    grants,
    gp,
  };
}
