import { describe, expect, it } from 'vitest';
import { checkoutAttempt } from './checkout-attempt';
describe('checkout attempt provenance', () => {
  it('keeps DEMO byte-compatible and without financial fields', () => {
    const value = checkoutAttempt({ mode: 'DEMO', version: 4, requestKey: 'key' });
    expect(JSON.stringify(value.input)).toBe('{"version":4,"requestKey":"key"}');
  });
  it('snapshots manual cash shift without deriving it from later selection', () => {
    const source = {
      mode: 'MANUAL' as const,
      version: 4,
      requestKey: 'key',
      method: 'CASH' as const,
      receivedAmount: ' 20.00 ',
      cashShiftId: 'original',
    };
    const value = checkoutAttempt(source);
    source.cashShiftId = 'replacement';
    source.receivedAmount = '99.00';
    expect(value.input).toEqual({
      version: 4,
      requestKey: 'key',
      cashShiftId: 'original',
      confirmed: true,
      method: 'CASH',
      receivedAmount: '20.00',
    });
  });
  it('requires a shift for card too, and never invents receivedAmount', () => {
    const source = {
      mode: 'MANUAL' as const,
      version: 4,
      requestKey: 'key',
      method: 'CARD' as const,
      receivedAmount: '99',
      cashShiftId: 'own',
    };
    expect(checkoutAttempt(source).input).toEqual({
      version: 4,
      requestKey: 'key',
      cashShiftId: 'own',
      confirmed: true,
      method: 'CARD',
    });
    expect(() => checkoutAttempt({ ...source, cashShiftId: '' })).toThrow();
  });
});
