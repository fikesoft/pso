import { expect, it } from 'vitest';
import { calculateDeliveryFee } from './calculate-delivery-fee';
import type { DeliveryFeeInput } from './delivery-fee.types';
function input(): DeliveryFeeInput {
  return {
    destination: { latitude: 47, longitude: 28 },
    subtotal: '100.00',
    timezone: 'Europe/Chisinau',
    asOf: new Date('2026-10-05T06:00:00Z'),
    zones: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        version: 1,
        status: 'ACTIVE',
        profile: {
          name: 'Centru',
          shape: { type: 'RADIUS', center: { latitude: 47, longitude: 28 }, radiusMeters: 3000 },
          minimumOrder: '100.00',
          deliveryFee: '25.50',
          freeDeliveryFrom: '300.00',
          estimatedMinutes: 45,
          priority: 10,
          activeHours: [{ weekday: 1, startMinute: 540, endMinute: 1080 }],
        },
      },
    ],
  };
}
it('pragurile minim/gratuit sunt exacte, inclusiv egalitatea', () => {
  const base = input();
  expect(calculateDeliveryFee({ ...base, subtotal: '99.99' })).toMatchObject({
    status: 'MINIMUM_NOT_MET',
    minimumOrder: '100.00',
  });
  expect(calculateDeliveryFee(base)).toMatchObject({
    status: 'AVAILABLE',
    fee: '25.50',
    total: '125.50',
  });
  expect(calculateDeliveryFee({ ...base, subtotal: '299.99' })).toMatchObject({
    fee: '25.50',
    total: '325.49',
  });
  expect(calculateDeliveryFee({ ...base, subtotal: '300.00' })).toMatchObject({
    fee: '0.00',
    total: '300.00',
  });
});
it('nu pierde bani peste precizia Number și refuză depășirea preciziei contractului', () => {
  const base = input();
  base.zones[0]!.profile.freeDeliveryFrom = null;
  expect(calculateDeliveryFee({ ...base, subtotal: '9007199254740993.01' })).toMatchObject({
    total: '9007199254741018.51',
  });
  expect(() => calculateDeliveryFee({ ...base, subtotal: '9999999999999999.99' })).toThrow();
});
it('acoperirea și programul sunt distincte, cu sfârșit exclusiv', () => {
  const base = input();
  expect(calculateDeliveryFee({ ...base, destination: { latitude: 48, longitude: 28 } })).toEqual({
    status: 'OUTSIDE_ZONE',
  });
  expect(calculateDeliveryFee({ ...base, asOf: new Date('2026-10-05T05:59:59Z') })).toEqual({
    status: 'CLOSED',
  });
  expect(calculateDeliveryFee({ ...base, asOf: new Date('2026-10-05T15:00:00Z') })).toEqual({
    status: 'CLOSED',
  });
  base.zones[0]!.status = 'ARCHIVED';
  expect(calculateDeliveryFee(base)).toEqual({ status: 'OUTSIDE_ZONE' });
});
it('prioritatea și UUID decid determinist; minimul nu poate fi ocolit prin altă zonă', () => {
  const base = input(),
    first = base.zones[0]!;
  base.zones = [
    {
      ...first,
      id: '00000000-0000-4000-8000-000000000002',
      profile: { ...first.profile, minimumOrder: '0.00', deliveryFee: '0.00' },
    },
    first,
  ];
  expect(calculateDeliveryFee({ ...base, subtotal: '99.99' })).toMatchObject({
    status: 'MINIMUM_NOT_MET',
    zoneId: first.id,
  });
  base.zones[0]!.profile.priority = 1;
  expect(calculateDeliveryFee(base)).toMatchObject({
    status: 'AVAILABLE',
    fee: '0.00',
    zoneId: base.zones[0]!.id,
  });
});
it('ambele apariții ale orei după schimbarea DST folosesc același program local', () => {
  const base = input();
  base.zones[0]!.profile.activeHours = [{ weekday: 7, startMinute: 180, endMinute: 240 }];
  for (const instant of ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z'])
    expect(calculateDeliveryFee({ ...base, asOf: new Date(instant) })).toMatchObject({
      status: 'AVAILABLE',
    });
  expect(calculateDeliveryFee({ ...base, asOf: new Date('2026-10-25T02:00:00Z') })).toEqual({
    status: 'CLOSED',
  });
});
it('un fus orar sau o destinație invalidă nu devin tarif gratuit', () => {
  expect(() => calculateDeliveryFee({ ...input(), timezone: 'invalid/timezone' })).toThrow();
  expect(() =>
    calculateDeliveryFee({ ...input(), destination: { latitude: NaN, longitude: 28 } }),
  ).toThrow();
  expect(() => calculateDeliveryFee({ ...input(), asOf: new Date(NaN) })).toThrow();
});
