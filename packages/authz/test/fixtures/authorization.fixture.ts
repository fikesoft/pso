import type {
  AuthorizationSnapshot,
  AuthzUser,
  DelegationGrant,
  PermissionOverride,
  Scope,
} from '../../src/index.js';

export const locationA: Scope = {
  organizationId: 'org-a',
  scopeType: 'LOCATION',
  locationId: 'location-a',
};
export const locationB: Scope = {
  organizationId: 'org-a',
  scopeType: 'LOCATION',
  locationId: 'location-b',
};
export const organization: Scope = {
  organizationId: 'org-a',
  scopeType: 'ORGANIZATION',
  locationId: null,
};
export const permission = (key: string) => ({ permission: key });
export function fixture(): AuthorizationSnapshot {
  return {
    organizationId: 'org-a',
    primaryAdminUserId: 'primary',
    users: [
      { id: 'primary', organizationId: 'org-a', status: 'ACTIVE', locationIds: [] },
      {
        id: 'ana',
        organizationId: 'org-a',
        status: 'ACTIVE',
        locationIds: ['location-a'],
        managedByUserId: 'primary',
      },
      {
        id: 'worker',
        organizationId: 'org-a',
        status: 'ACTIVE',
        locationIds: ['location-a'],
        managedByUserId: 'ana',
      },
      {
        id: 'peer',
        organizationId: 'org-a',
        status: 'ACTIVE',
        locationIds: ['location-a'],
        managedByUserId: 'primary',
      },
      { id: 'other', organizationId: 'org-b', status: 'ACTIVE', locationIds: ['foreign-location'] },
    ],
    locations: [
      { id: 'location-a', organizationId: 'org-a', status: 'ACTIVE' },
      { id: 'location-b', organizationId: 'org-a', status: 'ACTIVE' },
      { id: 'foreign-location', organizationId: 'org-b', status: 'ACTIVE' },
    ],
    roleVersions: [
      {
        id: 'admin-v1',
        organizationId: 'org-a',
        permissions: [
          'staff.create',
          'staff.credentials.reset',
          'orders.read',
          'orders.create',
          'kitchen.read',
        ].map(permission),
      },
      {
        id: 'waiter-v1',
        organizationId: 'org-a',
        permissions: ['orders.read', 'orders.create', 'kitchen.read'].map(permission),
      },
    ],
    assignments: [
      {
        ...locationA,
        id: 'admin-assignment',
        userId: 'ana',
        roleVersionId: 'admin-v1',
        issuerUserId: 'primary',
      },
      {
        ...locationA,
        id: 'worker-assignment',
        userId: 'worker',
        roleVersionId: 'waiter-v1',
        issuerUserId: 'ana',
        delegationGrantId: 'ana-ceiling',
      },
    ],
    overrides: [],
    delegations: [
      {
        ...locationA,
        id: 'ana-ceiling',
        userId: 'ana',
        issuerUserId: 'primary',
        status: 'ACTIVE',
        permissions: ['orders.read', 'orders.create', 'kitchen.read'].map(permission),
      },
    ],
  };
}
export function override(changes: Partial<PermissionOverride> = {}): PermissionOverride {
  return {
    ...locationA,
    id: 'override',
    userId: 'worker',
    permission: 'orders.read',
    effect: 'DENY',
    issuerUserId: 'primary',
    ...changes,
  };
}
export function changeUser(
  snapshot: AuthorizationSnapshot,
  id: string,
  changes: Partial<AuthzUser>,
): AuthorizationSnapshot {
  return {
    ...snapshot,
    users: snapshot.users.map((user) => (user.id === id ? { ...user, ...changes } : user)),
  };
}
export function changeDelegation(
  snapshot: AuthorizationSnapshot,
  changes: Partial<DelegationGrant>,
): AuthorizationSnapshot {
  return {
    ...snapshot,
    delegations: snapshot.delegations.map((grant) => ({ ...grant, ...changes })),
  };
}
