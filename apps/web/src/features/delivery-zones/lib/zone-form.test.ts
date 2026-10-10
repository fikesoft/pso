import { expect, it } from 'vitest';
import { deliveryZoneProfileSchema } from '@pos/contracts/delivery-zones';
import { emptyZoneProfile, formatZoneHours, parseZoneHours } from './zone-form';
it('programul păstrează intervalele adiacente și sfârșitul zilei fără oră inventată', () => {
  const value = 'luni 00:00-12:00\nluni 12:00-24:00\nduminica 09:30-18:45';
  expect(formatZoneHours(parseZoneHours(value))).toBe(value);
  expect(parseZoneHours('  ')).toEqual([]);
  for (const invalid of [
    'luni 23:00-01:00',
    'luni 09:60-11:00',
    'luni 24:00-24:00',
    'marti 1:00-09:00',
    'luni 09:00-12:00\nluni 11:00-13:00',
  ])
    expect(() => parseZoneHours(invalid)).toThrow();
});
it('o zonă nouă cere coordonate explicite, fără centru GPS inventat', () => {
  expect(
    deliveryZoneProfileSchema.safeParse({ ...emptyZoneProfile(), name: 'Centru' }).success,
  ).toBe(false);
});
