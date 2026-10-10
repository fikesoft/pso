import { expect, it } from 'vitest';
import {
  deliveryZoneProfileSchema,
  deliveryZoneShapeSchema,
  deliveryZoneHoursSchema,
} from './delivery-zones.schema';
import {
  isSimpleDeliveryPolygon,
  deliveryPolygonContains,
  deliveryDistanceMeters,
} from './delivery-geometry';
const point = (longitude: number, latitude: number) => ({ longitude, latitude });
const square = [point(28, 47), point(29, 47), point(29, 48), point(28, 48)];

it('validează poligoane simple indiferent de orientare și include muchia/colțul', () => {
  for (const vertices of [square, [...square].reverse()]) {
    expect(isSimpleDeliveryPolygon(vertices)).toBe(true);
    for (const p of [point(28.5, 47.5), point(28, 47.5), point(28, 47)])
      expect(deliveryPolygonContains(vertices, p)).toBe(true);
    expect(deliveryPolygonContains(vertices, point(29.1, 47.5))).toBe(false);
  }
});
it('refuză intersecții, muchii întoarse, coliniaritate, puncte repetate și antimeridian', () => {
  const invalid = [
    [],
    square.slice(0, 2),
    [...square, square[0]!],
    [square[0]!, square[2]!, square[1]!, square[3]!],
    [point(0, 0), point(1, 1), point(2, 2)],
    [point(0, 0), point(2, 0), point(1, 0), point(2, 2), point(0, 2)],
    [point(-179, 0), point(179, 0), point(179, 1)],
    [point(0, 0), point(1, 0), point(0, 91)],
  ];
  for (const vertices of invalid) {
    expect(isSimpleDeliveryPolygon(vertices)).toBe(false);
    expect(deliveryZoneShapeSchema.safeParse({ type: 'POLYGON', vertices }).success).toBe(false);
  }
});
it('poligonul concav păstrează golul exterior fără bounding-box aproximativ', () => {
  const concave = [point(0, 0), point(3, 0), point(3, 1), point(1, 1), point(1, 3), point(0, 3)];
  expect(isSimpleDeliveryPolygon(concave)).toBe(true);
  expect(deliveryPolygonContains(concave, point(2, 2))).toBe(false);
  expect(deliveryPolygonContains(concave, point(0.5, 2))).toBe(true);
});
it('distanța este simetrică, metrică și stabilă la antipozi/antimeridian', () => {
  expect(deliveryDistanceMeters(point(0, 0), point(0, 0))).toBe(0);
  expect(deliveryDistanceMeters(point(0, 0), point(1, 0))).toBeCloseTo(111195.08, 1);
  expect(deliveryDistanceMeters(point(179, 0), point(-179, 0))).toBeCloseTo(222390.16, 1);
  expect(deliveryDistanceMeters(square[0]!, square[1]!)).toBe(
    deliveryDistanceMeters(square[1]!, square[0]!),
  );
  expect(Number.isFinite(deliveryDistanceMeters(point(0, 0), point(180, 0)))).toBe(true);
});
it('raza refuză unități invalide, coordonate ascunse și numere nefinite', () => {
  for (const radiusMeters of [0, -1, 0.5, 100001, NaN, Infinity])
    expect(
      deliveryZoneShapeSchema.safeParse({ type: 'RADIUS', center: point(28, 47), radiusMeters })
        .success,
    ).toBe(false);
  expect(
    deliveryZoneShapeSchema.safeParse({ type: 'RADIUS', center: point(28, 47), radiusMeters: 1000 })
      .success,
  ).toBe(true);
  expect(
    deliveryZoneShapeSchema.safeParse({
      type: 'RADIUS',
      center: { ...point(28, 47), organizationId: 'x' },
      radiusMeters: 1000,
    }).success,
  ).toBe(false);
});
it('programul acceptă intervale adiacente și respinge suprapuneri/intervale nocturne ambigue', () => {
  expect(deliveryZoneHoursSchema.safeParse([]).success).toBe(true);
  const window = { weekday: 1, startMinute: 0, endMinute: 600 };
  expect(
    deliveryZoneHoursSchema.safeParse([window, { ...window, startMinute: 600, endMinute: 1440 }])
      .success,
  ).toBe(true);
  for (const other of [
    { ...window, startMinute: 599 },
    { ...window, startMinute: 600 },
    { ...window, weekday: 0 },
    { ...window, endMinute: 1441 },
  ])
    expect(deliveryZoneHoursSchema.safeParse([window, other]).success).toBe(false);
});
it('regulile financiare sunt exacte și pragul gratuit respectă minimul', () => {
  const profile = {
    name: 'Centru',
    shape: { type: 'POLYGON', vertices: square },
    minimumOrder: '100.01',
    deliveryFee: '10',
    freeDeliveryFrom: '100.01',
    estimatedMinutes: 30,
    activeHours: [],
    priority: 0,
  };
  expect(deliveryZoneProfileSchema.parse(profile).deliveryFee).toBe('10.00');
  expect(
    deliveryZoneProfileSchema.safeParse({ ...profile, freeDeliveryFrom: '100.00' }).success,
  ).toBe(false);
  expect(deliveryZoneProfileSchema.safeParse({ ...profile, freeDeliveryFrom: null }).success).toBe(
    true,
  );
});

it('comenzile refuză versiuni lipsă și mutarea contextului prin profil', async () => {
  const { deliveryZoneCommandSchema } = await import('./delivery-zone-commands.schema');
  const locationId = '4db56744-7b7f-4f4d-bbcd-9476c5628b4e';
  const requestKey = '0648bd44-801e-46e4-843b-f84be0be91aa';
  expect(
    deliveryZoneCommandSchema.safeParse({ action: 'ARCHIVE', locationId, requestKey, version: 1 })
      .success,
  ).toBe(true);
  for (const command of [
    { action: 'ARCHIVE', locationId, requestKey },
    { action: 'RESTORE', locationId, requestKey, version: 0 },
    { action: 'ARCHIVE', locationId, requestKey, version: 1, organizationId: locationId },
    { action: 'DELETE', locationId, requestKey, version: 1 },
  ])
    expect(deliveryZoneCommandSchema.safeParse(command).success).toBe(false);
});
