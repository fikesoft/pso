import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createOrderSchema,
  createProductSchema,
  priceSchema,
  quantitySchema,
  updateOrderSchema,
} from '../src';

describe('contracte operaționale stricte', () => {
  it('acceptă numai prețuri zecimale exacte în limitele documentate', () => {
    for (const price of ['0', '0.0001', '10.0050', '99999999.9999'])
      expect(priceSchema.safeParse(price).success).toBe(true);
    for (const price of [1.1, '-1', '1e2', 'Infinity', 'NaN', '100000000', '1.00001', '01', ' 1'])
      expect(priceSchema.safeParse(price).success).toBe(false);
  });
  it('cantitățile sunt pozitive, cu cel mult trei zecimale', () => {
    for (const quantity of ['1', '0.001', '9999.999'])
      expect(quantitySchema.safeParse(quantity).success).toBe(true);
    for (const quantity of ['0', '0.000', '-1', '10000', '0.0001', 2])
      expect(quantitySchema.safeParse(quantity).success).toBe(false);
  });
  it('respinge sumele și identitățile introduse în payload de client', () => {
    const product = { locationId: randomUUID(), name: 'Cafea', sku: 'CAFEA', price: '10' };
    expect(createProductSchema.safeParse(product).success).toBe(true);
    expect(
      createProductSchema.safeParse({ ...product, organizationId: randomUUID() }).success,
    ).toBe(false);
    const draft = {
      locationId: product.locationId,
      serviceType: 'TAKEAWAY',
      requestKey: randomUUID(),
      items: [{ productId: randomUUID(), quantity: '1' }],
    };
    expect(createOrderSchema.safeParse(draft).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...draft, total: '0' }).success).toBe(false);
    expect(
      createOrderSchema.safeParse({ ...draft, items: [{ ...draft.items[0], unitPrice: '0' }] })
        .success,
    ).toBe(false);
  });
  it('masa este obligatorie pentru servire, iar aceeași linie nu poate apărea de două ori', () => {
    const item = { id: randomUUID(), productId: randomUUID(), quantity: '1' };
    const draft = { version: 1, serviceType: 'DINE_IN', tableLabel: '  ', items: [item] };
    expect(updateOrderSchema.safeParse(draft).success).toBe(false);
    expect(updateOrderSchema.safeParse({ ...draft, tableLabel: '7' }).success).toBe(true);
    expect(
      updateOrderSchema.safeParse({ ...draft, tableLabel: '7', items: [item, item] }).success,
    ).toBe(false);
  });
});
