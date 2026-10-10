import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  acceptUpsellOfferSchema,
  createOrderSchema,
  showUpsellOfferSchema,
  updateOrderSchema,
  upsellMetricsQuerySchema,
} from '../src';

describe('upsell attribution boundaries', () => {
  it('accepts only explicit rule/cart claims, not forged timestamps or duplicate cart entries', () => {
    const input = {
      locationId: randomUUID(),
      requestKey: randomUUID(),
      ruleId: randomUUID(),
      ruleVersion: 1,
      productIds: [randomUUID()],
    };
    expect(showUpsellOfferSchema.safeParse(input).success).toBe(true);
    expect(
      showUpsellOfferSchema.safeParse({ ...input, shownAt: new Date().toISOString() }).success,
    ).toBe(false);
    expect(
      showUpsellOfferSchema.safeParse({
        ...input,
        productIds: [input.productIds[0], input.productIds[0]],
      }).success,
    ).toBe(false);
    expect(acceptUpsellOfferSchema.safeParse({ revenue: '10.00' }).success).toBe(false);
  });
  it('allows attribution only on a new line, including during draft edits', () => {
    const item = { productId: randomUUID(), quantity: '1', sourceUpsellOfferId: randomUUID() };
    const base = { serviceType: 'TAKEAWAY', items: [item] };
    expect(
      createOrderSchema.safeParse({ ...base, locationId: randomUUID(), requestKey: randomUUID() })
        .success,
    ).toBe(true);
    expect(updateOrderSchema.safeParse({ ...base, version: 1 }).success).toBe(true);
    expect(
      updateOrderSchema.safeParse({ ...base, version: 1, items: [{ ...item, id: randomUUID() }] })
        .success,
    ).toBe(false);
  });
  it('bounds metrics to explicit scoped rules and a positive period of at most 366 days', () => {
    const query = {
      locationId: randomUUID(),
      ruleIds: randomUUID(),
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    };
    expect(upsellMetricsQuerySchema.safeParse(query).success).toBe(true);
    for (const change of [
      { to: query.from },
      { to: '2028-01-01T00:00:00.000Z' },
      { ruleIds: '' },
      { ruleIds: Array.from({ length: 101 }, () => randomUUID()).join(',') },
    ])
      expect(upsellMetricsQuerySchema.safeParse({ ...query, ...change }).success).toBe(false);
  });
});
