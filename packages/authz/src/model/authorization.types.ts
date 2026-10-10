import type { ScopeType } from './catalog.types.js';

export interface Limits {
  readonly maxAmount?: string;
  readonly maxPercent?: string;
}
export interface Scope {
  readonly organizationId: string;
  readonly scopeType: ScopeType;
  readonly locationId?: string | null;
}
export interface ResourceContext extends Scope {
  readonly amount?: string;
  readonly percent?: string;
}
export interface AuthzUser {
  readonly id: string;
  readonly organizationId: string;
  readonly status: 'ACTIVE' | 'DISABLED' | 'PENDING';
  readonly locationIds: readonly string[];
  readonly managedByUserId?: string | null;
}
export interface AuthzLocation {
  readonly id: string;
  readonly organizationId: string;
  readonly status: 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
}
export interface PermissionEntry {
  readonly permission: string;
  readonly limits?: Limits;
}
export interface RoleVersion {
  readonly id: string;
  readonly organizationId: string;
  readonly permissions: readonly PermissionEntry[];
}
export interface Provenance {
  readonly issuerUserId: string;
  readonly delegationGrantId?: string | null;
  readonly revokedAt?: string | Date | null;
}
export interface RoleAssignment extends Scope, Provenance {
  readonly id: string;
  readonly userId: string;
  readonly roleVersionId: string;
}
export interface PermissionOverride extends Scope, Provenance, PermissionEntry {
  readonly id: string;
  readonly userId: string;
  readonly effect: 'ALLOW' | 'DENY';
}
export interface DelegationGrant extends Scope {
  readonly id: string;
  readonly userId: string;
  readonly issuerUserId: string;
  readonly status: 'ACTIVE' | 'REVOKED';
  readonly parentGrantId?: string | null;
  readonly canRedelegate?: boolean;
  readonly permissions: readonly PermissionEntry[];
}
/** A fresh snapshot must be loaded within the same tenant transaction as the operation. */
export interface AuthorizationSnapshot {
  readonly organizationId: string;
  readonly primaryAdminUserId: string;
  readonly users: readonly AuthzUser[];
  readonly locations: readonly AuthzLocation[];
  readonly roleVersions: readonly RoleVersion[];
  readonly assignments: readonly RoleAssignment[];
  readonly overrides: readonly PermissionOverride[];
  readonly delegations: readonly DelegationGrant[];
}
export type ManageOperation =
  | 'read'
  | 'create'
  | 'update'
  | 'deactivate'
  | 'activate'
  | 'resetPassword'
  | 'assignPermissions'
  | 'setDelegation'
  | 'removeDeny';
export type GrantDecision =
  | { readonly allowed: true; readonly delegationGrantId: string | null }
  | { readonly allowed: false; readonly delegationGrantId: null };

export interface AllowSource extends PermissionEntry, Provenance {
  readonly id: string;
}
