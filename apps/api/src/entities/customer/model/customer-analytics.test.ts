import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createCustomerAnalytics } from './customer-analytics';
import type { CustomerAnalyticsOrder } from './customer-analytics.types';

it('nu inventează medii sau date pentru clientul fără comenzi', () => {
  expect(createCustomerAnalytics(new Date('2026-10-04T12:00:00Z'), []).result()).toEqual({
    completedOrders: 0,
    orderValue: '0.00',
    collectedAmount: '0.00',
    refundedAmount: '0.00',
    totalSpent: '0.00',
    averageOrderValue: null,
    firstOrderAt: null,
    lastOrderAt: null,
    ordersLast30Days: 0,
    averageDaysBetweenOrders: null,
    favoriteProducts: [],
    favoriteLocation: null,
  });
});

it('calculează sume exacte peste precizia Number și separă valoarea, încasarea și rambursarea', () => {
  const locationId = randomUUID();
  const metrics = createCustomerAnalytics(new Date('2026-10-04T12:00:00Z'), [
    { id: locationId, name: 'Centru' },
  ]);
  const base: CustomerAnalyticsOrder = {
    id: randomUUID(),
    locationId,
    createdAt: new Date('2026-09-04T12:00:00Z'),
    total: '9999999999999999.99',
    collectedAmount: '9999999999999999.99',
    refundedAmount: '0.01',
    items: [],
  };
  metrics.add(base);
  metrics.add({
    ...base,
    id: randomUUID(),
    createdAt: new Date('2026-09-02T12:00:00Z'),
    total: '0.01',
    collectedAmount: '0.00',
    refundedAmount: '0.00',
  });
  expect(metrics.result()).toMatchObject({
    completedOrders: 2,
    orderValue: '10000000000000000.00',
    averageOrderValue: '5000000000000000.00',
    collectedAmount: '9999999999999999.99',
    refundedAmount: '0.01',
    totalSpent: '9999999999999999.98',
    ordersLast30Days: 1,
    averageDaysBetweenOrders: '2.00',
    firstOrderAt: '2026-09-02T12:00:00.000Z',
    lastOrderAt: '2026-09-04T12:00:00.000Z',
  });
});

it('preferințele folosesc cantități, comenzi distincte, ultimul snapshot și egalități stabile', () => {
  const a = randomUUID(),
    b = randomUUID(),
    product = randomUUID(),
    other = randomUUID();
  const locations = [
    { id: a, name: 'Centru' },
    { id: b, name: 'Nord' },
  ];
  const orders: CustomerAnalyticsOrder[] = [
    {
      id: randomUUID(),
      locationId: a,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      total: '10.00',
      collectedAmount: '10.00',
      refundedAmount: '10.00',
      items: [
        { productId: product, productName: 'Nume vechi', quantity: '0.125' },
        { productId: product, productName: 'Nume vechi', quantity: '0.125' },
      ],
    },
    {
      id: randomUUID(),
      locationId: b,
      createdAt: new Date('2026-10-02T00:00:00Z'),
      total: '20.00',
      collectedAmount: '20.00',
      refundedAmount: '5.00',
      items: [
        { productId: product, productName: 'Snapshot nou', quantity: '0.250' },
        { productId: other, productName: 'Alt produs', quantity: '0.500' },
      ],
    },
  ];
  const first = createCustomerAnalytics(new Date('2026-10-04T12:00:00Z'), locations);
  const reverse = createCustomerAnalytics(new Date('2026-10-04T12:00:00Z'), locations);
  orders.forEach(first.add);
  [...orders].reverse().forEach(reverse.add);
  expect(first.result()).toEqual(reverse.result());
  expect(first.result().favoriteProducts[0]).toEqual({
    productId: product,
    productName: 'Snapshot nou',
    quantity: '0.500',
    orderCount: 2,
  });
  expect(first.result().favoriteLocation).toEqual({
    locationId: b,
    name: 'Nord',
    orderCount: 1,
    totalSpent: '15.00',
  });
  expect(first.result()).toMatchObject({
    totalSpent: '15.00',
    refundedAmount: '15.00',
    averageOrderValue: '15.00',
  });
});

it('refuză o locație necuprinsă în raport, un moment viitor și rambursări inconsistente', () => {
  const locationId = randomUUID();
  const metrics = createCustomerAnalytics(new Date('2026-10-04T12:00:00Z'), [
    { id: locationId, name: 'Centru' },
  ]);
  const order: CustomerAnalyticsOrder = {
    id: randomUUID(),
    locationId,
    total: '1.00',
    collectedAmount: '1.00',
    refundedAmount: '0.00',
    createdAt: new Date('2026-10-04T11:00:00Z'),
    items: [],
  };
  expect(() => metrics.add({ ...order, locationId: randomUUID() })).toThrow();
  expect(() => metrics.add({ ...order, createdAt: new Date('2026-10-05T00:00:00Z') })).toThrow();
  expect(() => metrics.add({ ...order, refundedAmount: '2.00' })).toThrow();
  expect(metrics.result().completedOrders).toBe(0);
});
