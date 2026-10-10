import { expect, it } from 'vitest';
import { AuthorizationService, getPermission } from '../src';
import { fixture, locationA, override } from './fixtures/authorization.fixture';

it('turele proprii sunt PIN-compatible; numai închiderea altuia este privilegiată', () => {
  for (const permission of [
    'cash.shifts.read',
    'cash.shifts.open',
    'cash.shifts.close',
    'cash.reports.read',
  ])
    expect(getPermission(permission)?.privileged).toBe(false);
  expect(getPermission('cash.shifts.close-others')?.privileged).toBe(true);
});

it('ALLOW incompatibil este refuzat și din snapshot, inclusiv acordare de către PrimaryAdmin', () => {
  for (const permission of [
    'cash.shifts.read',
    'cash.shifts.close',
    'cash.shifts.close-others',
    'cash.reports.read',
    'cash.shifts.open',
  ]) {
    for (const limits of [
      { maxPercent: '10' },
      ...(permission === 'cash.shifts.open' ? [] : [{ maxAmount: '10' }]),
    ]) {
      const state = {
        ...fixture(),
        overrides: [override({ permission, effect: 'ALLOW', limits })],
      };
      const service = new AuthorizationService(state);
      expect(
        service.canUse('worker', permission, { ...locationA, amount: '1', percent: '1' }),
      ).toBe(false);
      expect(service.canGrant('primary', 'worker', permission, locationA, limits)).toBe(false);
    }
  }
});

it('limita de fond este evaluată, dar DENY cu limite incompatibile tot prevalează', () => {
  const state = {
    ...fixture(),
    overrides: [
      override({ permission: 'cash.shifts.open', effect: 'ALLOW', limits: { maxAmount: '100' } }),
    ],
  };
  let service = new AuthorizationService(state);
  expect(service.canUse('worker', 'cash.shifts.open', { ...locationA, amount: '100' })).toBe(true);
  expect(service.canUse('worker', 'cash.shifts.open', { ...locationA, amount: '101' })).toBe(false);
  state.overrides.push(
    override({ id: 'deny', permission: 'cash.shifts.open', limits: { maxPercent: '10' } }),
  );
  service = new AuthorizationService(state);
  expect(service.canUse('worker', 'cash.shifts.open', { ...locationA, amount: '1' })).toBe(false);
});

it('proveniența cu plafon incompatibil nu autorizează un ALLOW derivat', () => {
  const base = fixture();
  const state = {
    ...base,
    roleVersions: base.roleVersions.map((role) =>
      role.id === 'admin-v1'
        ? { ...role, permissions: [...role.permissions, { permission: 'cash.shifts.read' }] }
        : role,
    ),
    delegations: base.delegations.map((grant) => ({
      ...grant,
      permissions: [
        ...grant.permissions,
        { permission: 'cash.shifts.read', limits: { maxAmount: '10' } },
      ],
    })),
    overrides: [
      override({
        permission: 'cash.shifts.read',
        effect: 'ALLOW',
        issuerUserId: 'ana',
        delegationGrantId: 'ana-ceiling',
      }),
    ],
  };
  const service = new AuthorizationService(state);
  expect(service.canGrant('ana', 'worker', 'cash.shifts.read', locationA)).toBe(false);
  expect(service.canUse('worker', 'cash.shifts.read', locationA)).toBe(false);
});
