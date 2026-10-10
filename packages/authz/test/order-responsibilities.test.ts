import { expect, it } from 'vitest';
import { AuthorizationService, getPermission } from '../src';
import { fixture, locationA, override } from './fixtures/authorization.fixture';
it('predarea proprie permite PIN; prepare-others rămâne privilegiată și fără limite', () => {
  expect(getPermission('orders.handoff')?.privileged).toBe(false);
  expect(getPermission('orders.handoff-others')?.privileged).toBe(true);
  for (const permission of ['orders.handoff', 'orders.handoff-others']) {
    for (const limits of [{ maxAmount: '10' }, { maxPercent: '5' }]) {
      const service = new AuthorizationService({
        ...fixture(),
        overrides: [override({ permission, effect: 'ALLOW', limits })],
      });
      expect(service.canUse('worker', permission, { ...locationA, amount: '1' })).toBe(false);
      expect(service.canGrant('primary', 'worker', permission, locationA, limits)).toBe(false);
    }
    const service = new AuthorizationService({
      ...fixture(),
      overrides: [
        override({ permission, effect: 'ALLOW' }),
        override({ id: 'deny', permission, effect: 'DENY', limits: { maxAmount: '1' } }),
      ],
    });
    expect(service.canUse('worker', permission, locationA)).toBe(false);
  }
});
