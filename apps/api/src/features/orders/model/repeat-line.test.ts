import { randomUUID } from 'node:crypto';
import { Prisma } from '@pos/db';
import type { CatalogProduct } from '@pos/contracts';
import { expect, it } from 'vitest';
import { repeatLine } from './repeat-line';
import type { StoredOrderItem } from '../../../entities/order';
const productId = randomUUID();
const item = {
  id: randomUUID(),
  organizationId: randomUUID(),
  locationId: randomUUID(),
  orderId: randomUUID(),
  productId,
  productName: 'Vechi',
  productSku: 'OLD',
  position: 0,
  courseNumber: 0,
  unitPrice: new Prisma.Decimal('10'),
  baseUnitPrice: new Prisma.Decimal('10'),
  quantity: new Prisma.Decimal('1.333'),
  lineTotal: new Prisma.Decimal('13.33'),
  taxRateSnapshot: null,
  note: 'Notă sintetică',
  sourceUpsellOfferId: randomUUID(),
  sourceWebsiteOrderItemId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies StoredOrderItem;
const product: CatalogProduct = {
  id: productId,
  categoryId: null,
  name: 'Nou',
  sku: 'NEW',
  description: null,
  taxRate: null,
  status: 'ACTIVE',
  version: 2,
  locationId: item.locationId,
  price: '10.0050',
  enabled: true,
  locationVersion: 2,
  imageUrl: null,
  modifierGroups: [],
  scheduleAvailability: { available: true, scheduled: false, checkedAt: new Date().toISOString() },
  ingredients: null,
  allergens: [],
  calories: null,
  protein: null,
  fat: null,
  carbs: null,
  nutritionBasis: 'PER_PORTION',
};
it('calculează prețul curent exact și păstrează numai intenția liniei, fără identități/atribuiri vechi', () => {
  const line = repeatLine(item, [], product);
  expect(line.currentUnitPrice).toBe('10.0050');
  expect(line.currentLineTotal).toBe('13.34');
  expect(line.candidate).toEqual({ productId, quantity: '1.333', note: 'Notă sintetică' });
  expect(line.issues).toContainEqual({ code: 'PRICE_CHANGED', blocking: false });
  expect(line.historical.unitPrice).toBe('10.0000');
});
it('liniile indisponibile nu produc candidat sau subtotal inventat', () => {
  for (const changed of [
    undefined,
    { ...product, price: null },
    { ...product, enabled: false },
    { ...product, scheduleAvailability: { ...product.scheduleAvailability!, available: false } },
  ]) {
    const line = repeatLine(item, [], changed);
    expect(line.candidate).toBeNull();
    expect(line.currentLineTotal).toBeNull();
    expect(line.issues.some((issue) => issue.blocking)).toBe(true);
  }
});
