import { describe, expect, it } from 'vitest';
import { websiteDeliveryOrderSchema } from '../src/website-delivery';

function request() {
  return {
    schemaVersion: 1,
    externalOrderId: 'web-123',
    externalLocationCode: 'CENTRU',
    customer: { name: 'Client sintetic', phone: '+37300000000' },
    delivery: { address: 'Adresă sintetică de test' },
    paymentMethod: 'CASH_ON_DELIVERY',
    items: [{ externalProductId: 'sku-123', quantity: '1.250' }],
  };
}
describe('proposed website delivery contract', () => {
  it('keeps quantities exact and accepts a bounded delivery request', () => {
    expect(websiteDeliveryOrderSchema.parse(request()).items[0]!.quantity).toBe('1.250');
  });
  it('rejects caller-supplied authorization, prices and payment claims', () => {
    for (const extra of [
      { organizationId: 'foreign-tenant' },
      { locationId: 'foreign-location' },
      { total: '0.01' },
      { paid: true },
      { apiKey: 'do-not-accept-in-body' },
    ])
      expect(websiteDeliveryOrderSchema.safeParse({ ...request(), ...extra }).success).toBe(false);
    expect(
      websiteDeliveryOrderSchema.safeParse({
        ...request(),
        items: [{ ...request().items[0], unitPrice: '0.01' }],
      }).success,
    ).toBe(false);
    expect(
      websiteDeliveryOrderSchema.safeParse({ ...request(), paymentMethod: 'PAID_ONLINE' }).success,
    ).toBe(false);
  });
  it('rejects missing addresses, invalid quantities and oversized orders', () => {
    for (const items of [
      [],
      Array(51).fill(request().items[0]),
      [{ ...request().items[0], quantity: '0' }],
      [{ ...request().items[0], quantity: 1.25 }],
    ]) {
      expect(websiteDeliveryOrderSchema.safeParse({ ...request(), items }).success).toBe(false);
    }
    expect(
      websiteDeliveryOrderSchema.safeParse({ ...request(), delivery: { address: ' ' } }).success,
    ).toBe(false);
  });
});
