import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { db } from './support/harness';
import type { OrderSearchFixture } from './order-search.types';

export async function verifySearchContacts(f: OrderSearchFixture) {
  const customer = { name: 'Client contact sintetic', phone: '+373 69 111-222' };
  const order = await f.create({ customer });
  expect((await f.a.primary.expect(`/orders/${order.id}`)).order.customer).toEqual(customer);
  const stored = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    async (tx) => ({
      order: await tx.order.findUniqueOrThrow({ where: { id: order.id } }),
      audits: await tx.auditEvent.findMany({ where: { targetId: order.id } }),
    }),
  );
  expect(JSON.stringify(stored)).not.toContain(customer.name);
  expect(JSON.stringify(stored)).not.toContain(customer.phone);
  expect(JSON.stringify(stored)).not.toContain('37369111222');
  const body = {
    version: 1,
    serviceType: 'PICKUP',
    items: [{ id: order.items[0].id, productId: f.searchProduct.id, quantity: '2' }],
  };
  await f.a.primary.expect(`/orders/${order.id}`, 'PATCH', body);
  expect((await f.a.primary.expect(`/orders/${order.id}`)).order.customer).toEqual(customer);
  await f.a.primary.expect(`/orders/${order.id}`, 'PATCH', { ...body, version: 2, customer: null });
  expect((await f.a.primary.expect(`/orders/${order.id}`)).order.customer).toBeNull();
  expect((await f.search({ customerPhone: '37369111222' })).orders).toHaveLength(0);
  const absent = await f.create();
  expect((await f.a.primary.expect(`/orders/${absent.id}`)).order.customer).toBeNull();
  const noRead = await f.loginSearch(f.hidden);
  const hiddenBody = f.searchDraft({
    customer,
    items: [{ productId: f.searchProduct.id, quantity: '10' }],
  });
  const hidden = (await noRead.expect('/orders', 'POST', hiddenBody)).order;
  expect(hidden).not.toHaveProperty('customer');
  expect((await noRead.expect('/orders', 'POST', hiddenBody)).order).not.toHaveProperty('customer');
  expect(
    (
      await noRead.expect('/orders/creation-resolution', 'POST', {
        locationId: f.a.location.id,
        requestKey: hiddenBody.requestKey,
      })
    ).order,
  ).not.toHaveProperty('customer');
  expect(
    (
      await noRead.expect(`/orders/${hidden.id}`, 'PATCH', {
        version: 1,
        serviceType: 'PICKUP',
        customer: { name: 'Alt client secret', phone: '060555666' },
        items: [{ id: hidden.items[0].id, productId: f.searchProduct.id, quantity: '11' }],
      })
    ).order,
  ).not.toHaveProperty('customer');
  const limitedWriter = await f.loginSearch(f.writer);
  expect((await limitedWriter.expect('/orders', 'POST', hiddenBody)).order).not.toHaveProperty(
    'customer',
  );
  expect(
    (
      await limitedWriter.expect('/orders/creation-resolution', 'POST', {
        locationId: f.a.location.id,
        requestKey: hiddenBody.requestKey,
      })
    ).order,
  ).not.toHaveProperty('customer');
  expect((await limitedWriter.call(`/orders/${hidden.id}`)).status).toBe(403);
  const websiteBody = f.order({
    customer: { name: 'Website contact păstrat', phone: '+373(68)333444' },
  });
  const received = await f.inbound('/orders', 'POST', websiteBody);
  expect(received.status).toBe(200);
  const accepted = await f.a.primary.expect(
    `/website/orders/${received.data.receipt.id}/accept`,
    'POST',
    { version: 1 },
  );
  const websiteOrder = (await f.a.primary.expect(`/orders/${accepted.orderId}`)).order;
  expect(websiteOrder.customer).toEqual(websiteBody.customer);
  expect(
    (
      await f.search({
        customerName: 'website contact păstrat',
        customerPhone: '37368333444',
        source: 'WEB',
      })
    ).orders.map((entry: { id: string }) => entry.id),
  ).toEqual([websiteOrder.id]);
  const sent = await f.a.primary.expect(`/orders/${websiteOrder.id}/send`, 'POST', {
    version: 1,
    requestKey: randomUUID(),
  });
  const timeline = await f.a.primary.expect(`/orders/${websiteOrder.id}/timeline`);
  const kitchen = await f.a.primary.expect(`/kitchen/tickets?locationId=${f.a.location.id}`);
  for (const value of [sent, timeline, kitchen]) {
    expect(JSON.stringify(value)).not.toContain(websiteBody.customer.phone);
    expect(JSON.stringify(value)).not.toContain(websiteBody.customer.name);
    expect(JSON.stringify(value)).not.toContain(websiteBody.delivery.address);
  }
}
