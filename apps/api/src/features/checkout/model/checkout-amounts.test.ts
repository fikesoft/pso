import { describe, expect, it } from 'vitest';
import { checkoutAmounts } from './checkout-amounts';

describe('cash and manual checkout amounts', () => {
  it.each([
    ['10.01', '20.00', '9.99'],
    ['0.00', '0.00', '0.00'],
    ['10.01', '9007199254740993.01', '9007199254740983.00'],
    ['0.01', '9999999999999999.99', '9999999999999999.98'],
  ])(
    'computes exact change from total %s and received %s',
    (total, receivedAmount, changeAmount) => {
      const result = checkoutAmounts(
        {
          mode: 'MANUAL',
          body: { version: 4, requestKey: 'test', confirmed: true, method: 'CASH', receivedAmount },
        },
        total,
      );
      expect(result).toEqual({ method: 'CASH', receivedAmount, changeAmount });
    },
  );
  it('rejects underpayment and does not treat received cash as revenue', () => {
    expect(() =>
      checkoutAmounts(
        {
          mode: 'MANUAL',
          body: {
            version: 4,
            requestKey: 'test',
            confirmed: true,
            method: 'CASH',
            receivedAmount: '10.00',
          },
        },
        '10.01',
      ),
    ).toThrow('Suma primită este mai mică');
  });
  it('has no monetary tender for DEMO and zero change for a manually confirmed card', () => {
    expect(
      checkoutAmounts({ mode: 'DEMO', body: { version: 4, requestKey: 'test' } }, '10.01'),
    ).toEqual({ method: null, receivedAmount: null, changeAmount: null });
    expect(
      checkoutAmounts(
        {
          mode: 'MANUAL',
          body: { version: 4, requestKey: 'test', confirmed: true, method: 'CARD' },
        },
        '10.01',
      ),
    ).toEqual({ method: 'CARD', receivedAmount: '10.01', changeAmount: '0.00' });
  });
});
