import { describe, expect, it } from 'vitest';
import { decimalUnits, lineAmount, totalAmount } from './index';

describe('exact MDL amounts', () => {
  it('rounds half cents upward without binary floating point', () => {
    expect(lineAmount('0.005', '1')).toBe('0.01');
    expect(lineAmount('0.0049', '1')).toBe('0.00');
    expect(lineAmount('1.2345', '1.005')).toBe('1.24');
    expect(lineAmount('19.995', '3')).toBe('59.99');
  });
  it('keeps large amounts exact and sums rounded lines', () => {
    expect(lineAmount('99999999.9999', '9999.999')).toBe('999999899999.00');
    expect(totalAmount(['0.01', '0.01', '999999899999.00'])).toBe('999999899999.02');
    expect(totalAmount([])).toBe('0.00');
  });
  it('rejects signed, exponential and over-precision inputs', () => {
    for (const value of ['-1', '1e3', '0.001', 'NaN', '01', '1.'])
      expect(() => decimalUnits(value, 2)).toThrow();
  });
});
