import { completePacking } from './api/complete-packing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations } from './api/operations-setup';
import { prepareWebsite } from './api/website-setup';
import type { WebsiteFixture } from './api/website.types';

let f: WebsiteFixture;
beforeAll(async () => {
  f = await prepareWebsite();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
async function tax(productId: string, rate: string | null) {
  const current = (
    await f.a.primary.expect(`/catalog/products/${productId}?locationId=${f.a.location.id}`)
  ).product;
  return f.a.primary.expect(`/catalog/products/${productId}`, 'PATCH', {
    version: current.version,
    taxRate: rate,
  });
}
async function complete(orderId: string) {
  const current = (await f.a.primary.expect(`/orders/${orderId}`)).order;
  const { ticket } = await f.a.primary.expect(`/orders/${orderId}/send`, 'POST', {
    version: current.version,
    requestKey: randomUUID(),
  });
  await f.a.primary.expect(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
    version: ticket.version,
    status: 'PREPARING',
  });
  await f.a.primary.expect(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
    version: ticket.version + 1,
    status: 'READY',
  });
  const ready = await completePacking(f.a.primary, orderId);
  return f.a.primary.expect(`/orders/${orderId}/checkout/manual`, 'POST', {
    version: ready.version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
  });
}

it('keeps the selected tax on retained lines and receipts, while new lines use the current catalog rate', async () => {
  await tax(f.product.id, '20.125');
  const body = f.draft({ items: [{ productId: f.product.id, quantity: '1' }] });
  const original = (await f.a.primary.expect('/orders', 'POST', body)).order;
  expect(original.items[0]).toMatchObject({
    taxRateSnapshot: '20.1250',
    unitPrice: '10.0050',
    lineTotal: '10.01',
  });
  await tax(f.product.id, '7');
  expect((await f.a.primary.expect('/orders', 'POST', body)).order.items[0].taxRateSnapshot).toBe(
    '20.1250',
  );
  const changed = (
    await f.a.primary.expect(`/orders/${original.id}`, 'PATCH', {
      version: original.version,
      serviceType: 'DINE_IN',
      tableLabel: '7',
      items: [
        { id: original.items[0].id, productId: f.product.id, quantity: '3' },
        { productId: f.product.id, quantity: '1' },
      ],
    })
  ).order;
  expect(changed.items.map((item: { taxRateSnapshot: string }) => item.taxRateSnapshot)).toEqual([
    '20.1250',
    '7.0000',
  ]);
  expect(changed.total).toBe('40.03');
  expect(
    (
      await f.a.primary.call(
        '/orders',
        'POST',
        f.draft({ items: [{ productId: f.product.id, quantity: '1', taxRateSnapshot: '0' }] }),
      )
    ).status,
  ).toBe(400);
  const finalized = await complete(original.id);
  await tax(f.product.id, '10');
  const receipt = (await f.a.primary.expect(`/orders/${original.id}/receipt`)).receipt;
  expect(receipt).toEqual(finalized.receipt);
  expect(receipt.items.map((item: { taxRateSnapshot: string }) => item.taxRateSnapshot)).toEqual([
    '20.1250',
    '7.0000',
  ]);
  expect(receipt.total).toBe('40.03');
  expect((await f.b.primary.call(`/orders/${original.id}`)).status).toBe(404);
});

it('preserves an explicit zero from website receipt through operator acceptance and checkout', async () => {
  await tax(f.product.id, '0');
  const body = f.order();
  const key = randomUUID();
  const response = await f.inbound('/orders', 'POST', body, key);
  expect(response.status).toBe(200);
  const id = response.data.receipt.id;
  expect((await f.stored(id)).items[0]!.taxRateSnapshot?.toFixed(4)).toBe('0.0000');
  await tax(f.product.id, '20');
  expect(await f.inbound('/orders', 'POST', body, key)).toEqual(response);
  const inbox = (await f.a.primary.expect(`/website/orders/${id}`)).websiteOrder;
  expect(inbox.items[0].taxRateSnapshot).toBe('0.0000');
  const accepted = await f.a.primary.expect(`/website/orders/${id}/accept`, 'POST', {
    version: inbox.version,
  });
  const order = (await f.a.primary.expect(`/orders/${accepted.orderId}`)).order;
  expect(order.source).toBe('WEB');
  expect(order.items[0].taxRateSnapshot).toBe('0.0000');
  const { receipt } = await complete(order.id);
  expect(receipt.items[0].taxRateSnapshot).toBe('0.0000');
});

it('keeps unknown tax unknown when catalog configuration is added after website submission', async () => {
  await tax(f.secondProduct.id, null);
  const received = await f.inbound(
    '/orders',
    'POST',
    f.order({
      expectedTotal: '5.25',
      items: [{ externalProductId: f.secondProduct.sku, quantity: '1' }],
    }),
  );
  expect(received.status).toBe(200);
  await tax(f.secondProduct.id, '20');
  const accepted = await f.a.primary.expect(
    `/website/orders/${received.data.receipt.id}/accept`,
    'POST',
    { version: received.data.receipt.version },
  );
  const order = (await f.a.primary.expect(`/orders/${accepted.orderId}`)).order;
  expect(order.items[0].taxRateSnapshot).toBeNull();
  const { receipt } = await complete(order.id);
  expect(receipt.items[0].taxRateSnapshot).toBeNull();
});
