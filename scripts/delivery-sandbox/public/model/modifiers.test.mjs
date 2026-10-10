import { describe, expect, it } from 'vitest';
import { cartTotal, orderLine } from './modifiers.mjs';

describe('storefront modifier cart', () => {
  it('rounds each line exactly and retains different choices as separate lines', () => {
    const product = { externalProductId: 'COFFEE', unitTotal: '10.01' };
    const first = {
      product,
      modifiers: [
        {
          bindingId: 'b',
          bindingVersion: 2,
          groupVersion: 3,
          optionIds: ['z', 'a'],
          prices: ['0.0050', '1.0000'],
        },
      ],
    };
    const second = { product, modifiers: [] };
    expect(cartTotal([first, second])).toBe('21.03');
    expect(orderLine(first)).toMatchObject({
      quantity: '1.000',
      modifiers: [{ optionIds: ['a', 'z'] }],
    });
    expect(orderLine(second).modifiers).toEqual([]);
    expect(
      cartTotal([
        {
          product: { ...product, price: '10.0050' },
          modifiers: [{ prices: ['0.0050'] }],
        },
      ]),
    ).toBe('10.01');
  });
});
