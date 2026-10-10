import { completePacking } from './api/complete-packing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations, prepareOperations } from './api/operations-setup';
import type { OperationsFixture } from './api/operations.types';

let f: OperationsFixture;
let rule: { id: string; version: number };
const from = new Date(Date.now() - 86_400_000).toISOString();
beforeAll(async () => {
  f = await prepareOperations();
  rule = (
    await f.manager.expect('/catalog/upsell-rules', 'POST', {
      requestKey: randomUUID(),
      locationId: f.a.location.id,
      sourceProductId: f.product.id,
      targetProductId: f.secondProduct.id,
      name: 'Recomandare verificată',
    })
  ).rule;
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
const showBody = () => ({
  requestKey: randomUUID(),
  locationId: f.a.location.id,
  ruleId: rule.id,
  ruleVersion: rule.version,
  productIds: [f.product.id],
});
async function acceptedOffer() {
  const offer = (await f.worker.expect('/catalog/upsell-offers', 'POST', showBody())).offer;
  return (await f.worker.expect(`/catalog/upsell-offers/${offer.id}/accept`, 'POST', {})).offer;
}
const metricsPath = () =>
  `/catalog/upsell-metrics?${new URLSearchParams({ locationId: f.a.location.id, ruleIds: rule.id, from, to: new Date(Date.now() + 1000).toISOString() })}`;
const metrics = async () => (await f.a.primary.expect(metricsPath())).metrics[0];
const makeDraft = (offerId: string, quantity = '1') =>
  f.draft({
    items: [
      { productId: f.product.id, quantity: '1' },
      { productId: f.secondProduct.id, quantity, sourceUpsellOfferId: offerId },
    ],
  });

it('records display and acceptance once, preserving actor scope and immutable display payload', async () => {
  const body = showBody();
  expect((await f.cook.call('/catalog/upsell-offers', 'POST', body)).status).toBe(403);
  expect(
    (await f.worker.call('/catalog/upsell-offers', 'POST', { ...body, productIds: [] })).status,
  ).toBe(409);
  expect(
    (await f.worker.call('/catalog/upsell-offers', 'POST', { ...body, ruleVersion: 99 })).status,
  ).toBe(409);
  const [one, two] = await Promise.all([
    f.worker.expect('/catalog/upsell-offers', 'POST', body),
    f.worker.expect('/catalog/upsell-offers', 'POST', body),
  ]);
  expect(one).toEqual(two);
  expect(
    (
      await f.worker.call('/catalog/upsell-offers', 'POST', {
        ...body,
        productIds: [f.secondProduct.id],
      })
    ).status,
  ).toBe(409);
  expect(
    (await f.manager.call(`/catalog/upsell-offers/${one.offer.id}/accept`, 'POST', {})).status,
  ).toBe(404);
  expect(
    (await f.b.primary.call(`/catalog/upsell-offers/${one.offer.id}/accept`, 'POST', {})).status,
  ).toBe(404);
  expect((await f.worker.call('/orders', 'POST', makeDraft(one.offer.id))).status).toBe(409);
  expect(await metrics()).toMatchObject({
    shown: '1',
    accepted: '0',
    conversionPercent: '0.00',
    revenue: '0.00',
  });
  const accepted = await f.worker.expect(
    `/catalog/upsell-offers/${one.offer.id}/accept`,
    'POST',
    {},
  );
  expect(
    await f.worker.expect(`/catalog/upsell-offers/${one.offer.id}/accept`, 'POST', {}),
  ).toEqual(accepted);
  expect(await metrics()).toMatchObject({
    shown: '1',
    accepted: '1',
    conversionPercent: '100.00',
    revenue: '0.00',
  });
  expect((await f.worker.call(metricsPath())).status).toBe(403);
  expect((await f.manager.expect(metricsPath())).metrics[0]).toMatchObject({
    shown: '1',
    accepted: '1',
    revenue: null,
  });
  expect((await f.manager.call('/catalog/upsell-offers', 'POST', showBody())).status).toBe(403);
  expect((await f.b.primary.call(metricsPath())).status).toBe(403);
  expect(
    (await f.manager.call(metricsPath().replace(f.a.location.id, f.otherLocation.id))).status,
  ).toBe(403);
});

it('attributes one offer to one matching line and preserves the claim after draft removal', async () => {
  const offer = await acceptedOffer();
  const body = makeDraft(offer.id);
  expect((await f.a.primary.call('/orders', 'POST', body)).status).toBe(409);
  expect(
    (
      await f.worker.call(
        '/orders',
        'POST',
        f.draft({
          items: [{ productId: f.product.id, quantity: '1', sourceUpsellOfferId: offer.id }],
        }),
      )
    ).status,
  ).toBe(409);
  const [one, two] = await Promise.all([
    f.worker.expect('/orders', 'POST', body),
    f.worker.expect('/orders', 'POST', body),
  ]);
  expect(one.order.id).toBe(two.order.id);
  const order = one.order;
  expect(
    (await f.worker.call('/orders', 'POST', { ...body, requestKey: randomUUID() })).status,
  ).toBe(409);
  expect(
    (
      await f.worker.call(`/orders/${order.id}`, 'PATCH', {
        version: order.version,
        serviceType: 'TAKEAWAY',
        items: [
          {
            id: order.items[1].id,
            productId: f.secondProduct.id,
            quantity: '2',
            sourceUpsellOfferId: offer.id,
          },
        ],
      })
    ).status,
  ).toBe(400);
  const changed = (
    await f.worker.expect(`/orders/${order.id}`, 'PATCH', {
      version: order.version,
      serviceType: 'TAKEAWAY',
      items: [
        { id: order.items[0].id, productId: f.product.id, quantity: '1' },
        { id: order.items[1].id, productId: f.secondProduct.id, quantity: '2' },
      ],
    })
  ).order;
  expect(await metrics()).toMatchObject({ revenue: '0.00' });
  await f.worker.expect(`/orders/${order.id}`, 'PATCH', {
    version: changed.version,
    serviceType: 'TAKEAWAY',
    items: [{ id: order.items[0].id, productId: f.product.id, quantity: '1' }],
  });
  expect((await f.worker.call('/orders', 'POST', makeDraft(offer.id))).status).toBe(409);
  expect(
    (await f.worker.call(`/catalog/upsell-offers/${offer.id}/accept`, 'POST', {})).status,
  ).toBe(409);
});

it('counts the paid snapshot line only; ignores demo, cancellation and unconfirmed carts', async () => {
  for (const mode of ['DEMO', 'MANUAL', 'CANCELLED'] as const) {
    const offer = await acceptedOffer();
    let order = (await f.worker.expect('/orders', 'POST', makeDraft(offer.id, '2'))).order;
    if (mode === 'CANCELLED') {
      await f.worker.expect(`/orders/${order.id}/cancel`, 'POST', { version: order.version });
      continue;
    }
    const ticket = (
      await f.worker.expect(`/orders/${order.id}/send`, 'POST', {
        version: order.version,
        requestKey: randomUUID(),
      })
    ).ticket;
    await f.cook.expect(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
      version: ticket.version,
      status: 'PREPARING',
    });
    await f.cook.expect(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
      version: ticket.version + 1,
      status: 'READY',
    });
    order = await completePacking(f.a.primary, order.id);
    expect(await metrics()).toMatchObject({ revenue: '0.00' });
    const checkout = {
      version: order.version,
      requestKey: randomUUID(),
      ...(mode === 'MANUAL'
        ? {
            method: 'CASH',
            receivedAmount: order.total,
            confirmed: true,
            cashShiftId: (await f.cashShift()).id,
          }
        : {}),
    };
    await f.a.primary.expect(
      `/orders/${order.id}/checkout/${mode.toLowerCase()}`,
      'POST',
      checkout,
    );
    await f.a.primary.expect(
      `/orders/${order.id}/checkout/${mode.toLowerCase()}`,
      'POST',
      checkout,
    );
  }
  expect(await metrics()).toMatchObject({ shown: '5', accepted: '5', revenue: '10.50' });
  const current = (await f.manager.expect(`/catalog/upsell-rules/${rule.id}`)).rule;
  await f.manager.expect(`/catalog/upsell-rules/${rule.id}`, 'PATCH', {
    version: current.version,
    name: 'Regulă arhivată',
    sortOrder: 0,
    status: 'ARCHIVED',
  });
  expect(await metrics()).toMatchObject({ shown: '5', revenue: '10.50' });
  const future = new URLSearchParams({
    locationId: f.a.location.id,
    ruleIds: rule.id,
    from: '2099-01-01T00:00:00.000Z',
    to: '2099-02-01T00:00:00.000Z',
  });
  expect((await f.a.primary.expect(`/catalog/upsell-metrics?${future}`)).metrics[0]).toMatchObject({
    shown: '0',
    accepted: '0',
    conversionPercent: '0.00',
    revenue: '0.00',
  });
});
