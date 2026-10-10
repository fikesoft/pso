import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  courierCommandSchema,
  courierProfileSchema,
  courierResolutionSchema,
} from '../src/couriers';
describe('contractul profilului și disponibilității curierului', () => {
  const context = { locationId: randomUUID(), requestKey: randomUUID() };
  it('separă profilul local de identitate, drepturi și starea derivată din comenzi', () => {
    const create = {
      ...context,
      action: 'CREATE',
      userId: randomUUID(),
      profile: { vehicle: 'BICYCLE', capacity: 2 },
    };
    expect(courierCommandSchema.safeParse(create).success).toBe(true);
    for (const extra of [
      { availability: 'AVAILABLE' },
      { organizationId: randomUUID() },
      { role: 'courier' },
      { activeDeliveries: 0 },
    ])
      expect(courierCommandSchema.safeParse({ ...create, ...extra }).success).toBe(false);
    expect(
      courierCommandSchema.safeParse({
        ...context,
        action: 'SET_AVAILABILITY',
        version: 1,
        availability: 'IN_DELIVERY',
      }).success,
    ).toBe(false);
    expect(
      courierCommandSchema.safeParse({
        ...context,
        action: 'UPDATE',
        version: 1,
        userId: randomUUID(),
        profile: create.profile,
      }).success,
    ).toBe(false);
  });
  it('limitează capacitatea și nu acceptă pierderea preciziei versiunii', () => {
    for (const capacity of [0, -1, 1.5, 21, Infinity])
      expect(courierProfileSchema.safeParse({ vehicle: 'CAR', capacity }).success).toBe(false);
    for (const version of [0, 1.5, 2147483647])
      expect(
        courierCommandSchema.safeParse({ ...context, action: 'ARCHIVE', version }).success,
      ).toBe(false);
    expect(
      courierCommandSchema.safeParse({
        ...context,
        action: 'SET_AVAILABILITY',
        version: 1,
        availability: 'PAUSED',
      }).success,
    ).toBe(true);
  });
  it('rezoluția folosește doar cheia și contextul acțiunii, fără profil sau date personale', () => {
    const body = { ...context, action: 'CREATE' };
    expect(courierResolutionSchema.parse(body)).toEqual(body);
    expect(courierResolutionSchema.safeParse({ ...body, userId: randomUUID() }).success).toBe(
      false,
    );
    expect(
      courierResolutionSchema.safeParse({ ...body, profile: { vehicle: 'CAR', capacity: 1 } })
        .success,
    ).toBe(false);
  });
});
