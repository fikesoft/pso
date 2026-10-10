import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  customerAnalyticsQuerySchema,
  customerAnalyticsMetricsSchema,
} from './customer-analytics.schema';

it('analiticele cer un scope explicit, fără locație ascunsă în scope-ul companiei', () => {
  expect(
    customerAnalyticsQuerySchema.safeParse({ scopeType: 'LOCATION', locationId: randomUUID() })
      .success,
  ).toBe(true);
  expect(customerAnalyticsQuerySchema.safeParse({ scopeType: 'ORGANIZATION' }).success).toBe(true);
  for (const query of [
    {},
    { scopeType: 'LOCATION' },
    { scopeType: 'ORGANIZATION', locationId: randomUUID() },
    { scopeType: 'ORGANIZATION', organizationId: randomUUID() },
    { scopeType: 'ALL' },
  ])
    expect(customerAnalyticsQuerySchema.safeParse(query).success).toBe(false);
});

it('sumele agregate sunt stringuri exacte, iar mediile fără istoric pot fi null', () => {
  const empty = {
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
  };
  expect(customerAnalyticsMetricsSchema.safeParse(empty).success).toBe(true);
  expect(
    customerAnalyticsMetricsSchema.safeParse({ ...empty, orderValue: '100000000000000000.00' })
      .success,
  ).toBe(true);
  for (const orderValue of [0, '-1.00', '1e4', '0.001', '01.00'])
    expect(customerAnalyticsMetricsSchema.safeParse({ ...empty, orderValue }).success).toBe(false);
});
