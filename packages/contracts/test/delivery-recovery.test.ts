import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import { deliveryResolutionSchema, deliveryResolutionResponseSchema } from '../src/delivery';
it('delivery resolution rejects mutation data and accepts only a scoped terminal reference', () => {
  const pointer = { locationId: randomUUID(), requestKey: randomUUID(), status: 'PICKED_UP' };
  expect(deliveryResolutionSchema.safeParse(pointer).success).toBe(true);
  for (const patch of [
    { reason: 'Motiv' },
    { version: 3 },
    { courierUserId: randomUUID() },
    { status: 'NOT_REQUIRED' },
  ])
    expect(deliveryResolutionSchema.safeParse({ ...pointer, ...patch }).success).toBe(false);
  const result = {
    status: 'RETIRED',
    locationId: pointer.locationId,
    orderId: randomUUID(),
    requestKey: pointer.requestKey,
    toStatus: pointer.status,
  };
  expect(deliveryResolutionResponseSchema.safeParse(result).success).toBe(true);
  expect(deliveryResolutionResponseSchema.safeParse({ ...result, operation: {} }).success).toBe(
    false,
  );
});
