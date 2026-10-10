import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { db, noSecrets } from './support/harness';
import type { WebsiteFixture } from './website.types';

export async function verifyWebsiteReceiving(f: WebsiteFixture) {
  const catalog = await f.inbound('/catalog');
  expect(catalog.status).toBe(200);
  expect(
    catalog.data.products.find(
      (product: { productId: string }) => product.productId === f.product.id,
    ),
  ).toMatchObject({ externalProductId: f.product.sku, price: '10.0050', unitTotal: '10.01' });
  const request = f.order();
  const key = randomUUID();
  const responses = await Promise.all([
    f.inbound('/orders', 'POST', request, key),
    f.inbound(
      '/orders',
      'POST',
      {
        ...request,
        items: [{ externalProductId: f.product.sku, quantity: '1.000' }],
        expectedTotal: '10.01',
      },
      key,
    ),
  ]);
  expect(responses[0].status).toBe(200);
  expect(responses[1].status).toBe(200);
  expect(responses[1].data).toEqual(responses[0].data);
  const replay = await f.inbound(
    '/orders',
    'POST',
    { ...request, items: [{ externalProductId: f.product.sku, quantity: '1.000' }] },
    key,
  );
  expect(replay.data).toEqual(responses[0].data);
  const receipt = responses[0].data.receipt;
  expect(receipt).toMatchObject({
    externalOrderId: request.externalOrderId,
    status: 'AWAITING_ACCEPTANCE',
    total: '10.01',
    currency: 'MDL',
    orderId: null,
  });
  expect((await f.inbound(`/orders?externalOrderId=${request.externalOrderId}`)).data).toEqual(
    replay.data,
  );
  const stored = await f.stored(receipt.id);
  expect(stored.items).toHaveLength(1);
  expect(stored.audits).toHaveLength(1);
  expect(stored.order).toMatchObject({
    createdWithKeyId: f.credentials.key.id,
    status: 'PENDING',
    orderId: null,
  });
  expect(stored.order.customerDataEncrypted).not.toContain(request.customer.name);
  expect(JSON.stringify(receipt)).not.toMatch(/customer|phone|address|instructions|secretHash/);
  expect(JSON.stringify(stored.audits)).not.toContain(request.customer.phone);
  const detail = await f.a.primary.expect(`/website/orders/${receipt.id}`);
  expect(detail.websiteOrder.customer).toEqual(request.customer);
  expect(detail.websiteOrder.delivery).toEqual(request.delivery);
  const list = await f.a.primary.expect(`/website/orders?locationId=${f.a.location.id}`);
  expect(JSON.stringify(list)).not.toMatch(
    /customer|phone|address|instructions|customerDataEncrypted/,
  );
  noSecrets(catalog.data);
  noSecrets(receipt);
  noSecrets(detail);
  expect(
    (await f.inbound('/orders', 'POST', { ...request, expectedTotal: '20' }, key)).status,
  ).toBe(409);
  expect((await f.inbound('/orders', 'POST', request)).status).toBe(409);
}

export async function verifyWebsitePriceAndReplay(f: WebsiteFixture) {
  const bad = await f.inbound('/orders', 'POST', f.order({ expectedTotal: '1.00' }));
  expect(bad.status).toBe(409);
  expect(bad.data).toMatchObject({
    code: 'WEBSITE_PRICE_CHANGED',
    details: { currentTotal: '10.01', currency: 'MDL' },
  });
  const body = f.order();
  const key = randomUUID();
  const first = await f.inbound('/orders', 'POST', body, key);
  expect(first.status).toBe(200);
  await f.a.primary.expect(
    `/catalog/products/${f.product.id}/locations/${f.a.location.id}`,
    'PUT',
    { version: 1, price: '99', enabled: true },
  );
  expect((await f.inbound('/orders', 'POST', body, key)).data).toEqual(first.data);
  expect((await f.inbound('/orders', 'POST', f.order())).data.code).toBe('WEBSITE_PRICE_CHANGED');
  const accepted = await f.a.primary.expect(
    `/website/orders/${first.data.receipt.id}/accept`,
    'POST',
    { version: 1 },
  );
  const order = (await f.a.primary.expect(`/orders/${accepted.orderId}`)).order;
  expect(order).toMatchObject({
    total: '10.01',
    serviceType: 'DELIVERY',
    status: 'DRAFT',
    notes: null,
  });
  expect(order.items[0].unitPrice).toBe('10.0050');
  await f.a.primary.expect(
    `/catalog/products/${f.product.id}/locations/${f.a.location.id}`,
    'PUT',
    { version: 2, price: '10.0050', enabled: true },
  );
  const count = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    (tx) => tx.websiteOrder.count({ where: { externalOrderId: body.externalOrderId } }),
  );
  expect(count).toBe(1);
}
