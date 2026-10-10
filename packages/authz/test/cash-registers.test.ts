import { expect, it } from 'vitest';
import { AuthorizationService, getPermission } from '../src';
import { fixture, locationA, locationB, organization } from './fixtures/authorization.fixture';
it('case: scope local, fără granturi implicite și DENY', () => {
  let state = fixture();
  let service = new AuthorizationService(state);
  expect(getPermission('cash.registers.manage')).toMatchObject({
    privileged: true,
    delegable: true,
    scopeTypes: ['LOCATION'],
  });
  expect(service.canUse('primary', 'cash.registers.manage', locationA)).toBe(true);
  expect(service.canUse('ana', 'cash.registers.manage', locationA)).toBe(false);
  state = {
    ...state,
    roleVersions: [
      ...state.roleVersions,
      {
        id: 'cash-v1',
        organizationId: 'org-a',
        permissions: [
          { permission: 'cash.registers.read' },
          { permission: 'cash.registers.manage' },
        ],
      },
    ],
  };
  state = {
    ...state,
    assignments: [
      ...state.assignments,
      {
        ...locationA,
        id: 'cash-ana',
        userId: 'ana',
        roleVersionId: 'cash-v1',
        issuerUserId: 'primary',
      },
    ],
  };
  service = new AuthorizationService(state);
  expect(service.canUse('ana', 'cash.registers.manage', locationA)).toBe(true);
  expect(service.canUse('ana', 'cash.registers.manage', locationB)).toBe(false);
  expect(service.canUse('ana', 'cash.registers.manage', organization)).toBe(false);
  expect(service.requiresMfa('ana')).toBe(true);
  state = {
    ...state,
    overrides: [
      ...state.overrides,
      {
        ...locationA,
        id: 'cash-deny',
        userId: 'ana',
        permission: 'cash.registers.manage',
        effect: 'DENY',
        issuerUserId: 'primary',
      },
    ],
  };
  expect(new AuthorizationService(state).canUse('ana', 'cash.registers.manage', locationA)).toBe(
    false,
  );
});
it('case: delegarea are proveniență vie și nu se extinde la altă locație', () => {
  const base = fixture();
  const state = {
    ...base,
    roleVersions: base.roleVersions.map((role) =>
      role.id === 'admin-v1'
        ? { ...role, permissions: [...role.permissions, { permission: 'cash.registers.read' }] }
        : role,
    ),
    delegations: base.delegations.map((grant) => ({
      ...grant,
      permissions: [...grant.permissions, { permission: 'cash.registers.read' }],
    })),
    overrides: [
      ...base.overrides,
      {
        ...locationA,
        id: 'cash-derived',
        userId: 'worker',
        permission: 'cash.registers.read',
        effect: 'ALLOW' as const,
        issuerUserId: 'ana',
        delegationGrantId: 'ana-ceiling',
      },
    ],
  };
  const service = new AuthorizationService(state);
  expect(service.canGrant('ana', 'worker', 'cash.registers.read', locationA)).toBe(true);
  expect(service.canGrant('ana', 'worker', 'cash.registers.manage', locationA)).toBe(false);
  expect(service.canUse('worker', 'cash.registers.read', locationA)).toBe(true);
  expect(service.canUse('worker', 'cash.registers.read', locationB)).toBe(false);
  expect(
    new AuthorizationService({
      ...state,
      delegations: state.delegations.map((grant) => ({ ...grant, status: 'REVOKED' })),
    }).canUse('worker', 'cash.registers.read', locationA),
  ).toBe(false);
});
