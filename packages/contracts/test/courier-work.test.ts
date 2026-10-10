import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { courierWorkQuerySchema, courierWorkListResponseSchema } from '../src/courier-work';
describe('courier work read contracts', () => {
  it('rejects selecting another courier, unbounded pages and invalid views', () => {
    const locationId = randomUUID();
    expect(courierWorkQuerySchema.parse({ locationId })).toEqual({
      locationId,
      view: 'ACTIVE',
      limit: 20,
    });
    for (const patch of [
      { userId: randomUUID() },
      { limit: 51 },
      { limit: 0 },
      { view: 'ALL' },
      { cursor: '' },
    ])
      expect(courierWorkQuerySchema.safeParse({ locationId, ...patch }).success).toBe(false);
  });
  it('binds every returned order to its courier, location and view without duplicates', () => {
    const locationId = randomUUID(),
      courierUserId = randomUUID();
    const order = {
      orderId: randomUUID(),
      locationId,
      orderVersion: 3,
      assignmentId: randomUUID(),
      courierUserId,
      number: 7,
      deliveryStatus: 'ASSIGNED',
      kitchenStatus: 'PARTIALLY_READY',
      packingStatus: 'PACKING',
      customer: { name: 'Client sintetic', phone: '+37360000000' },
      deliveryAddress: { address: 'Adresă sintetică' },
      notes: null,
      total: '10.50',
      outstandingAmount: '10.50',
      currency: 'MDL',
      assignedAt: new Date().toISOString(),
      acceptedAt: null,
      deliveryProof: null,
      updatedAt: new Date().toISOString(),
    };
    const response = {
      locationId,
      courierUserId,
      view: 'ACTIVE',
      orders: [order],
      nextCursor: null,
    };
    expect(courierWorkListResponseSchema.safeParse(response).success).toBe(true);
    for (const patch of [
      { locationId: randomUUID() },
      { courierUserId: randomUUID() },
      { deliveryStatus: 'DELIVERED' },
      { outstandingAmount: '-1.00' },
    ])
      expect(
        courierWorkListResponseSchema.safeParse({ ...response, orders: [{ ...order, ...patch }] })
          .success,
      ).toBe(false);
    expect(
      courierWorkListResponseSchema.safeParse({ ...response, orders: [order, order] }).success,
    ).toBe(false);
    expect(
      courierWorkListResponseSchema.safeParse({
        ...response,
        view: 'HISTORY',
        orders: [{ ...order, deliveryStatus: 'DELIVERED' }],
      }).success,
    ).toBe(true);
  });
});
