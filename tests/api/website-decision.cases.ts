import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { db } from './support/harness';
import type { WebsiteFixture } from './website.types';

export async function verifyWebsiteDecisions(f: WebsiteFixture) {
  const operator = await f.login('operator');
  const body = f.order();
  const incoming = await f.inbound('/orders', 'POST', body);
  expect(incoming.status).toBe(200);
  const id = incoming.data.receipt.id;
  const accepted = await Promise.all([
    operator.expect(`/website/orders/${id}/accept`, 'POST', { version: 1 }),
    operator.expect(`/website/orders/${id}/accept`, 'POST', { version: 1 }),
  ]);
  expect(accepted[0]).toEqual(accepted[1]);
  expect(accepted[0].websiteOrder.status).toBe('ACCEPTED');
  const order = (await operator.expect(`/orders/${accepted[0].orderId}`)).order;
  expect(order).toMatchObject({
    status: 'DRAFT',
    version: 1,
    serviceType: 'DELIVERY',
    total: '10.01',
    notes: null,
    tableLabel: null,
  });
  const stored = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    async (tx) => ({
      order: await tx.order.findUniqueOrThrow({ where: { id: order.id } }),
      consumption: await tx.inventoryDocument.count({ where: { orderId: order.id } }),
    }),
  );
  expect(stored.order.createdByUserId).toBe(f.actors.operator.user.id);
  expect(stored.consumption).toBe(0);
  const sent = await operator.expect(`/orders/${order.id}/send`, 'POST', {
    version: 1,
    requestKey: randomUUID(),
  });
  expect(sent.ticket.status).toBe('QUEUED');
  expect(JSON.stringify(sent)).not.toContain(body.customer.phone);
  expect(JSON.stringify(sent)).not.toContain(body.delivery.address);
  expect(
    (await f.inbound(`/orders?externalOrderId=${body.externalOrderId}`)).data.receipt,
  ).toMatchObject({ status: 'ACCEPTED', orderId: order.id });
  const another = (await f.inbound('/orders', 'POST', f.order())).data.receipt;
  const rejected = await operator.expect(`/website/orders/${another.id}/reject`, 'POST', {
    version: 1,
    reason: 'Nu putem livra',
  });
  expect(
    await operator.expect(`/website/orders/${another.id}/reject`, 'POST', {
      version: 1,
      reason: 'Nu putem livra',
    }),
  ).toEqual(rejected);
  expect(
    (
      await operator.call(`/website/orders/${another.id}/reject`, 'POST', {
        version: 1,
        reason: 'Alt motiv de refuz',
      })
    ).status,
  ).toBe(409);
  expect(
    (await operator.call(`/website/orders/${another.id}/accept`, 'POST', { version: 1 })).status,
  ).toBe(409);
  const racing = (await f.inbound('/orders', 'POST', f.order())).data.receipt;
  const race = await Promise.all([
    operator.call(`/website/orders/${racing.id}/accept`, 'POST', { version: 1 }),
    operator.call(`/website/orders/${racing.id}/reject`, 'POST', {
      version: 1,
      reason: 'Decizie concurentă',
    }),
  ]);
  expect(race.map((entry) => entry.status).sort()).toEqual([200, 409]);
}

export async function verifyWebsitePaginationAndAvailability(f: WebsiteFixture) {
  const first = await f.inbound('/catalog?limit=1');
  const next = await f.inbound(`/catalog?limit=1&cursor=${first.data.nextCursor}`);
  expect(next.data.products[0].productId).not.toBe(first.data.products[0].productId);
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await f.a.primary.expect(
      `/website/orders?locationId=${f.a.location.id}&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
    );
    for (const order of page.orders) {
      expect(seen.has(order.id)).toBe(false);
      seen.add(order.id);
    }
    cursor = page.nextCursor;
  } while (cursor);
  expect(seen.size).toBeGreaterThan(5);
  const receipt = (await f.inbound('/orders', 'POST', f.order())).data.receipt;
  const completedReceipt = (await f.inbound('/orders', 'POST', f.order())).data.receipt;
  const accepted = await f.a.primary.expect(
    `/website/orders/${completedReceipt.id}/accept`,
    'POST',
    { version: 1 },
  );
  const countOrders = () =>
    db.withTenantTransaction(db.runtime, { organizationId: f.a.company.organization.id }, (tx) =>
      tx.order.count(),
    );
  const before = await countOrders();
  await f.a.primary.expect(
    `/catalog/products/${f.product.id}/locations/${f.a.location.id}`,
    'PUT',
    { version: 3, price: '10.0050', enabled: false },
  );
  const unavailable = await f.a.primary.call(`/website/orders/${receipt.id}/accept`, 'POST', {
    version: 1,
  });
  expect(unavailable.status).toBe(409);
  expect(unavailable.data.code).toBe('WEBSITE_PRODUCT_UNAVAILABLE');
  expect((await f.stored(receipt.id)).order).toMatchObject({
    status: 'PENDING',
    orderId: null,
    version: 1,
  });
  expect(await countOrders()).toBe(before);
  expect(
    (
      await f.a.primary.expect(`/website/orders/${completedReceipt.id}/accept`, 'POST', {
        version: 1,
      })
    ).orderId,
  ).toBe(accepted.orderId);
  const refreshed = await f.a.primary.expect(`/website/orders/${receipt.id}`);
  expect(
    (
      await f.a.primary.expect(`/website/orders/${receipt.id}/reject`, 'POST', {
        version: refreshed.websiteOrder.version,
        reason: 'Produs indisponibil după reconfirmare',
      })
    ).websiteOrder.status,
  ).toBe('REJECTED');
  expect((await f.inbound('/orders', 'POST', f.order())).status).toBe(409);
  expect(
    (await f.inbound('/catalog')).data.products.some(
      (product: { productId: string }) => product.productId === f.product.id,
    ),
  ).toBe(false);
  await f.a.primary.expect(
    `/catalog/products/${f.product.id}/locations/${f.a.location.id}`,
    'PUT',
    { version: 4, price: '10.0050', enabled: true },
  );
}
