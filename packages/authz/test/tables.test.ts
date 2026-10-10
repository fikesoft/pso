import { expect, it } from 'vitest';
import { AuthorizationService, getPermission } from '../src';
import { fixture, locationA, locationB, organization } from './fixtures/authorization.fixture';
it('mese: scope local, fără granturi implicite și DENY', () => {
  let state = fixture();
  let service = new AuthorizationService(state);
  expect(getPermission('tables.manage')).toMatchObject({
    privileged: true,
    delegable: true,
    scopeTypes: ['LOCATION'],
  });
  expect(service.canUse('primary', 'tables.manage', locationA)).toBe(true);
  expect(service.canUse('ana', 'tables.manage', locationA)).toBe(false);
  state = {
    ...state,
    roleVersions: [
      ...state.roleVersions,
      {
        id: 'table-v1',
        organizationId: 'org-a',
        permissions: [{ permission: 'tables.read' }, { permission: 'tables.manage' }],
      },
    ],
  };
  state = {
    ...state,
    assignments: [
      ...state.assignments,
      {
        ...locationA,
        id: 'table-ana',
        userId: 'ana',
        roleVersionId: 'table-v1',
        issuerUserId: 'primary',
      },
    ],
  };
  service = new AuthorizationService(state);
  expect(service.canUse('ana', 'tables.manage', locationA)).toBe(true);
  expect(service.canUse('ana', 'tables.manage', locationB)).toBe(false);
  expect(service.canUse('ana', 'tables.manage', organization)).toBe(false);
  expect(service.requiresMfa('ana')).toBe(true);
  state = {
    ...state,
    overrides: [
      ...state.overrides,
      {
        ...locationA,
        id: 'table-deny',
        userId: 'ana',
        permission: 'tables.manage',
        effect: 'DENY',
        issuerUserId: 'primary',
      },
    ],
  };
  expect(new AuthorizationService(state).canUse('ana', 'tables.manage', locationA)).toBe(false);
});
it('mese: delegarea are proveniență vie și nu se extinde la altă locație', () => {
  const base = fixture();
  const state = {
    ...base,
    roleVersions: base.roleVersions.map((role) =>
      role.id === 'admin-v1'
        ? { ...role, permissions: [...role.permissions, { permission: 'tables.read' }] }
        : role,
    ),
    delegations: base.delegations.map((grant) => ({
      ...grant,
      permissions: [...grant.permissions, { permission: 'tables.read' }],
    })),
    overrides: [
      ...base.overrides,
      {
        ...locationA,
        id: 'table-derived',
        userId: 'worker',
        permission: 'tables.read',
        effect: 'ALLOW' as const,
        issuerUserId: 'ana',
        delegationGrantId: 'ana-ceiling',
      },
    ],
  };
  const service = new AuthorizationService(state);
  expect(service.canGrant('ana', 'worker', 'tables.read', locationA)).toBe(true);
  expect(service.canGrant('ana', 'worker', 'tables.manage', locationA)).toBe(false);
  expect(service.canUse('worker', 'tables.read', locationA)).toBe(true);
  expect(service.canUse('worker', 'tables.read', locationB)).toBe(false);
  expect(
    new AuthorizationService({
      ...state,
      delegations: state.delegations.map((grant) => ({ ...grant, status: 'REVOKED' })),
    }).canUse('worker', 'tables.read', locationA),
  ).toBe(false);
});
