import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import {
  courierAcceptanceSchema,
  courierAcceptanceResolutionSchema,
  courierAcceptanceResolutionResponseSchema,
} from '../src/courier-work';
it('courier acceptance requires explicit confirmation and forbids forged state or identity', () => {
  const body = {
    locationId: randomUUID(),
    assignmentId: randomUUID(),
    requestKey: randomUUID(),
    orderVersion: 3,
    confirmed: true,
  };
  expect(courierAcceptanceSchema.safeParse(body).success).toBe(true);
  for (const patch of [
    { confirmed: false },
    { confirmed: undefined },
    { orderVersion: 0 },
    { actorUserId: randomUUID() },
    { acceptedAt: new Date().toISOString() },
    { deliveryStatus: 'DELIVERED' },
  ])
    expect(courierAcceptanceSchema.safeParse({ ...body, ...patch }).success).toBe(false);
});
it('courier acceptance recovery contains only a scoped reference and has a terminal retired result', () => {
  const pointer = {
    locationId: randomUUID(),
    assignmentId: randomUUID(),
    requestKey: randomUUID(),
  };
  expect(courierAcceptanceResolutionSchema.safeParse(pointer).success).toBe(true);
  for (const patch of [{ confirmed: true }, { orderVersion: 2 }, { customer: 'Client' }])
    expect(courierAcceptanceResolutionSchema.safeParse({ ...pointer, ...patch }).success).toBe(
      false,
    );
  expect(
    courierAcceptanceResolutionResponseSchema.safeParse({
      ...pointer,
      orderId: randomUUID(),
      status: 'RETIRED',
    }).success,
  ).toBe(true);
  expect(
    courierAcceptanceResolutionResponseSchema.safeParse({
      ...pointer,
      orderId: randomUUID(),
      status: 'RETIRED',
      acceptedAt: new Date().toISOString(),
    }).success,
  ).toBe(false);
});
