import { describe, expect, it } from 'vitest';
import {
  businessHoursSchema,
  createLocationSchema,
  updateLocationSchema,
} from './locations.schema';

describe('programul și coordonatele locației', () => {
  it('păstrează un interval peste miezul nopții și ziua duminică', () => {
    const hours = [{ day: 0, opensAt: '20:00', closesAt: '02:00' }];
    expect(businessHoursSchema.parse(hours)).toEqual(hours);
  });
  it('respinge ore nule, intervale ambigue și zile duplicate', () => {
    for (const hours of [
      [{ day: 1, opensAt: null, closesAt: null }],
      [{ day: 1, opensAt: '24:00', closesAt: '02:00' }],
      [{ day: 1, opensAt: '09:00', closesAt: '09:00' }],
      [
        { day: 1, opensAt: '09:00', closesAt: '12:00' },
        { day: 1, opensAt: '13:00', closesAt: '18:00' },
      ],
    ])
      expect(businessHoursSchema.safeParse(hours).success).toBe(false);
  });
  it('creează numai perechi de coordonate exacte în limitele geografice', () => {
    const input = { name: 'Centru', code: 'CTR' };
    expect(createLocationSchema.safeParse({ ...input, latitude: '47.123456' }).success).toBe(false);
    expect(
      createLocationSchema.safeParse({ ...input, latitude: '91', longitude: '28' }).success,
    ).toBe(false);
    expect(
      createLocationSchema.parse({ ...input, latitude: '47.123456', longitude: '28.123456' }),
    ).toMatchObject({ latitude: '47.123456', longitude: '28.123456' });
    expect(
      createLocationSchema.safeParse({ ...input, latitude: null, longitude: null }).success,
    ).toBe(true);
  });
  it('nu permite schimbarea tenantului sau metadate nevalidate prin PATCH', () => {
    expect(
      updateLocationSchema.safeParse({ version: 1, organizationId: crypto.randomUUID() }).success,
    ).toBe(false);
    expect(updateLocationSchema.safeParse({ version: 1, timezone: 'Fus/Inventat' }).success).toBe(
      false,
    );
    expect(updateLocationSchema.safeParse({ latitude: '47', longitude: '28' }).success).toBe(false);
  });
});
