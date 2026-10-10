import { expect, it } from 'vitest';
import { AuthorizationService, getPermission } from '../src';
import { fixture, locationA, locationB, override } from './fixtures/authorization.fixture';
it('numerar: PIN, maxAmount exact, DENY și scope fără excepție managerială', () => {
  expect(getPermission('cash.movements.create')).toMatchObject({
    privileged: false,
    supportedLimits: ['maxAmount'],
    scopeTypes: ['LOCATION'],
  });
  const state = {
    ...fixture(),
    overrides: [
      override({
        permission: 'cash.movements.create',
        effect: 'ALLOW',
        limits: { maxAmount: '20.01' },
      }),
    ],
  };
  const service = new AuthorizationService(state);
  expect(service.canUse('worker', 'cash.movements.create', { ...locationA, amount: '20.01' })).toBe(
    true,
  );
  expect(service.canUse('worker', 'cash.movements.create', { ...locationA, amount: '20.02' })).toBe(
    false,
  );
  expect(service.canUse('worker', 'cash.movements.create', locationB)).toBe(false);
  expect(
    new AuthorizationService({
      ...state,
      overrides: [
        ...state.overrides,
        override({ id: 'deny', permission: 'cash.movements.create', limits: { maxPercent: '1' } }),
      ],
    }).canUse('worker', 'cash.movements.create', locationA),
  ).toBe(false);
});
it('snapshot și proveniență cu maxPercent incompatibil nu pot autoriza mișcări', () => {
  const base = fixture();
  const service = new AuthorizationService({
    ...base,
    overrides: [
      override({
        permission: 'cash.movements.create',
        effect: 'ALLOW',
        limits: { maxPercent: '5' },
      }),
    ],
  });
  expect(service.canUse('worker', 'cash.movements.create', { ...locationA, amount: '1' })).toBe(
    false,
  );
  expect(
    service.canGrant('primary', 'worker', 'cash.movements.create', locationA, { maxPercent: '5' }),
  ).toBe(false);
  const derived = new AuthorizationService({
    ...base,
    roleVersions: base.roleVersions.map((r) =>
      r.id === 'admin-v1'
        ? { ...r, permissions: [...r.permissions, { permission: 'cash.movements.create' }] }
        : r,
    ),
    delegations: base.delegations.map((g) => ({
      ...g,
      permissions: [{ permission: 'cash.movements.create', limits: { maxPercent: '5' } }],
    })),
    overrides: [
      override({
        permission: 'cash.movements.create',
        effect: 'ALLOW',
        issuerUserId: 'ana',
        delegationGrantId: 'ana-ceiling',
      }),
    ],
  });
  expect(derived.canUse('worker', 'cash.movements.create', locationA)).toBe(false);
});
