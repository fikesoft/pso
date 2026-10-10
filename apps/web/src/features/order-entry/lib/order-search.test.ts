import { describe, expect, it } from 'vitest';
import { orderSearchInput } from './order-search';
import { EMPTY_ORDER_SEARCH } from '../config/order-search.constants';
describe('order search body', () => {
  it('omits blank filters and resets pagination without leaking prior contacts', () => {
    expect(orderSearchInput({ ...EMPTY_ORDER_SEARCH }, 'location')).toEqual({
      locationId: 'location',
    });
    expect(
      orderSearchInput(
        { ...EMPTY_ORDER_SEARCH, customerName: '  ', customerPhone: '  ' },
        'location',
      ),
    ).toEqual({ locationId: 'location' });
  });
  it('keeps calendar dates and full phone for authoritative server interpretation', () => {
    expect(
      orderSearchInput(
        {
          ...EMPTY_ORDER_SEARCH,
          number: '42',
          customerName: ' Client Test ',
          customerPhone: ' +373 60 000 000 ',
          source: 'UNKNOWN',
          createdByUserId: 'creator',
          createdFrom: '2026-03-29',
          createdTo: '2026-03-29',
        },
        'location',
      ),
    ).toEqual({
      locationId: 'location',
      number: 42,
      customerName: 'Client Test',
      customerPhone: '+373 60 000 000',
      source: 'UNKNOWN',
      createdByUserId: 'creator',
      createdFrom: '2026-03-29',
      createdTo: '2026-03-29',
    });
  });
  it('rejects nonintegral and unsafe numbers and reversed dates before requesting', () => {
    expect(
      orderSearchInput({ ...EMPTY_ORDER_SEARCH, number: '2147483647' }, 'location').number,
    ).toBe(2147483647);
    for (const number of ['-1', '1.2', '0', '2147483648', '9007199254740993'])
      expect(() => orderSearchInput({ ...EMPTY_ORDER_SEARCH, number }, 'location')).toThrow();
    expect(() =>
      orderSearchInput(
        { ...EMPTY_ORDER_SEARCH, createdFrom: '2026-09-02', createdTo: '2026-09-01' },
        'location',
      ),
    ).toThrow();
  });
});
