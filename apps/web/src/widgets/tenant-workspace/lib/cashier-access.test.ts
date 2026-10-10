import { describe, expect, it } from 'vitest';
import { canOpenCashier } from './cashier-access';

describe('cashier navigation capabilities', () => {
  it.each([
    [[], false],
    [['orders.create'], true],
    [['orders.read'], false],
    [['payments.collect'], false],
    [['payments.refund'], false],
    [['payments.collect', 'payments.refund'], false],
    [['orders.read', 'payments.collect'], true],
    [['orders.read', 'payments.refund'], true],
    [['orders.create', 'payments.collect'], true],
  ] as [string[], boolean][])(
    'uses effective permissions %j to decide entry %s',
    (permissions, allowed) => {
      expect(canOpenCashier((permission) => permissions.includes(permission))).toBe(allowed);
    },
  );
});
