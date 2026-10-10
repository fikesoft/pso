import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareCustomerAnalytics } from './api/customer-analytics-setup';
import type { CustomerAnalyticsFixture } from './api/customer-analytics.types';
import { closeOperations } from './api/operations-setup';
import { db, noSecrets, fixturePasswords } from './api/support/harness';
import { readCustomerAnalytics } from '../apps/api/src/entities/customer';

let f: CustomerAnalyticsFixture;
beforeAll(async () => {
  f = await prepareCustomerAnalytics();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
const path = (id: string, scope = `scopeType=LOCATION&locationId=${f.a.location.id}`) =>
  `/customers/${id}/analytics?${scope}`;

it('indicatorii disting sumele reale, rambursările și valoarea, excluzând DEMO/ciorne/contacte manuale', async () => {
  const customer = await f.createCustomer();
  expect((await f.a.primary.expect(path(customer.id))).metrics).toMatchObject({
    completedOrders: 0,
    averageOrderValue: null,
  });
  expect((await f.a.primary.expect(path(customer.id))).rfm).toMatchObject({
    scores: null,
    recencyDays: null,
    segments: [],
    frequency: 0,
    monetary: '0.00',
  });
  const first = await f.createOrder(customer.id);
  await f.finish(first.id);
  const payment = await f.collect(first.id, '7.25');
  await f.refund(first.id, payment.id, '2.25');
  const second = await f.createOrder(customer.id, {
    items: [{ productId: f.secondProduct.id, quantity: '4' }],
  });
  await f.finish(second.id);
  await f.createOrder(customer.id);
  const cancelled = await f.createOrder(customer.id);
  await f.a.primary.expect(`/orders/${cancelled.id}/cancel`, 'POST', {
    version: cancelled.version,
    requestKey: randomUUID(),
    reason: 'Comandă anulată pentru proba analitică',
  });
  const demo = await f.createOrder(customer.id);
  await f.finish(demo.id, true);
  const manual = await f.createOrder(null, {
    customer: { name: customer.name, phone: customer.phone },
  });
  await f.finish(manual.id);
  const response = await f.a.primary.call(path(customer.id));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.data.metrics).toMatchObject({
    completedOrders: 2,
    orderValue: '31.50',
    averageOrderValue: '15.75',
    collectedAmount: '7.25',
    refundedAmount: '2.25',
    totalSpent: '5.00',
    ordersLast30Days: 2,
    favoriteProducts: [
      { productId: f.secondProduct.id, productName: 'Ceai', quantity: '6.000', orderCount: 2 },
    ],
    favoriteLocation: { locationId: f.a.location.id, orderCount: 2, totalSpent: '5.00' },
  });
  expect(response.data.rfm).toMatchObject({
    policyVersion: 'RFM_V1',
    recencyDays: 0,
    frequency: 2,
    monetary: '5.00',
    scores: { recency: 5, frequency: 2, monetary: 1 },
    segments: [],
  });
  await f.a.primary.expect(`/customers/${customer.id}/commands`, 'POST', {
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    action: 'ARCHIVE',
    version: 1,
  });
  expect((await f.a.primary.expect(path(customer.id))).metrics).toEqual(response.data.metrics);
  expect(JSON.stringify(response.data)).not.toContain(customer.phone);
  noSecrets(response.data);
});

it('acoperirea cere drept explicit și păstrează tenantul, locația și limitele valorice', async () => {
  const customer = await f.createCustomer();
  const first = await f.createOrder(customer.id);
  await f.finish(first.id);
  const large = await f.createOrder(customer.id, {
    items: [{ productId: f.secondProduct.id, quantity: '4' }],
  });
  await f.finish(large.id);
  await f.a.primary.expect(
    `/catalog/products/${f.secondProduct.id}/locations/${f.otherLocation.id}`,
    'PUT',
    {
      price: '5.25',
      enabled: true,
    },
  );
  const north = await f.createOrder(customer.id, { locationId: f.otherLocation.id });
  await f.finish(north.id);
  const combined = await f.a.primary.expect(path(customer.id, 'scopeType=ORGANIZATION'));
  expect(combined.metrics).toMatchObject({ completedOrders: 3, orderValue: '42.00' });
  expect(combined.locations).toHaveLength(2);
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Analiză limitată local',
      permissions: [{ permission: 'orders.read', limits: { maxAmount: '15' } }],
    })
  ).role;
  const crm = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Citire analitică',
      permissions: [{ permission: 'customers.read' }, { permission: 'customers.analytics.read' }],
    })
  ).role;
  const actor = await f.a.primary.expect('/staff', 'POST', {
    login: 'analytics-limited',
    displayName: 'Analist sintetic',
    authenticationMethod: 'PIN',
    locationIds: [f.a.location.id, f.otherLocation.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
      { roleVersionId: crm.versions[0].id, scopeType: 'ORGANIZATION' },
    ],
  });
  fixturePasswords.add(actor.pin);
  const reader = await f.loginCustomer(f.reader);
  expect((await reader.call(path(customer.id))).status).toBe(403);
  const limited = await f.loginCustomer({ actor, role });
  const report = await limited.expect(path(customer.id, 'scopeType=ORGANIZATION'));
  expect(report.locations).toEqual([{ id: f.a.location.id, name: f.a.location.name }]);
  expect(report.metrics).toMatchObject({ completedOrders: 1, orderValue: '10.50' });
  expect(report.rfm).toMatchObject({ frequency: 1, monetary: '0.00', segments: ['NEW'] });
  expect(
    (await limited.call(path(customer.id, `scopeType=LOCATION&locationId=${f.otherLocation.id}`)))
      .status,
  ).toBe(403);
  expect(
    (await f.b.primary.call(path(customer.id, `scopeType=LOCATION&locationId=${f.b.location.id}`)))
      .status,
  ).toBe(404);
  expect(
    (await limited.call(path(customer.id, `scopeType=ORGANIZATION&locationId=${f.a.location.id}`)))
      .status,
  ).toBe(400);
  await f.a.primary.expect(`/staff/${actor.user.id}/overrides`, 'POST', {
    permission: 'customers.analytics.read',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.loginCustomer({ actor, role });
  expect((await denied.call(path(customer.id))).status).toBe(403);
});

it('citirea folosește RLS real, context tranzacțional și snapshot coerent la o rambursare concurentă', async () => {
  const customer = await f.createCustomer();
  const order = await f.createOrder(customer.id);
  await f.finish(order.id);
  const payment = await f.collect(order.id, '10.50');
  const input = {
    organizationId: f.a.company.organization.id,
    customerId: customer.id,
    locations: [{ id: f.a.location.id, name: f.a.location.name }],
    canRead: () => true,
  };
  await db.withTenantTransaction(
    db.runtime,
    { organizationId: input.organizationId },
    async (tx) => {
      const before = await readCustomerAnalytics(tx, input);
      expect(before.metrics.totalSpent).toBe('10.50');
      await f.refund(order.id, payment.id, '1.00');
      expect(await readCustomerAnalytics(tx, input)).toEqual(before);
    },
    { readOnlySnapshot: true },
  );
  expect((await f.a.primary.expect(path(customer.id))).metrics.totalSpent).toBe('9.50');
  const absent = await db.runtime.$transaction((tx) => readCustomerAnalytics(tx, input));
  expect(absent.metrics.completedOrders).toBe(0);
  const foreign = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.b.company.organization.id },
    (tx) => readCustomerAnalytics(tx, input),
    { readOnlySnapshot: true },
  );
  expect(foreign.metrics.completedOrders).toBe(0);
});
