import { describe, expect, it } from 'vitest';
import type { CashClosingDto } from '@pos/contracts';
import { closingCashComponents } from './closing-cash-components';
const legacy = {
  cashCollected: '15.00',
  cashRefunded: '2.00',
  expectedCash: '33.00',
  cardCollected: '0.00',
  cardRefunded: '0.00',
  cardNet: '0.00',
  paidOrderCount: 1,
  refundOperationCount: 1,
};
describe('closing summary generations', () => {
  it('derives zero only for legacy snapshots without changing their serialized shape', () => {
    const value = Object.freeze({ ...legacy });
    const serialized = JSON.stringify(value);
    expect(closingCashComponents(value)).toEqual({ cashIn: '0.00', cashOut: '0.00' });
    expect(JSON.stringify(value)).toBe(serialized);
    expect(value).not.toHaveProperty('cashIn');
  });
  it('preserves explicit movement strings in the new snapshot', () => {
    expect(closingCashComponents({ ...legacy, cashIn: '20.00', cashOut: '7.00' })).toEqual({
      cashIn: '20.00',
      cashOut: '7.00',
    });
  });
  it('rejects partially populated or null new fields rather than silently showing zero', () => {
    for (const value of [
      { ...legacy, cashIn: '1.00' },
      { ...legacy, cashOut: '1.00' },
      { ...legacy, cashIn: null, cashOut: null },
    ])
      expect(() => closingCashComponents(value as CashClosingDto['summary'])).toThrow();
  });
});
