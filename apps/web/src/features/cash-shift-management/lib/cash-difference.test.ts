import { describe, expect, it } from 'vitest';
import { cashAmountsDiffer } from './cash-difference';
describe('counted cash comparison', () => {
  it('compares cents exactly beyond floating point precision', () => {
    expect(cashAmountsDiffer('9999999999999999.99', '9999999999999999.98')).toBe(true);
    expect(cashAmountsDiffer('00100.0', '100.00')).toBe(false);
    expect(cashAmountsDiffer('0', '0.00')).toBe(false);
  });
  it('does not invent a difference while the input is invalid or empty', () => {
    expect(cashAmountsDiffer('', '10.00')).toBe(false);
    expect(cashAmountsDiffer('1.001', '10.00')).toBe(false);
  });
});
