import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
let f: Awaited<ReturnType<typeof prepareOperations>>;
beforeAll(async () => {
  f = await prepareOperations();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('KDS aplică regulile actuale fără a reinterpreta categoria istorică sau a modifica tichetul', async () => {
  const scope = { scopeType: 'ORGANIZATION' };
  const categoryTarget = { kind: 'CATEGORY', categoryId: f.category.id };
  await f.a.primary.expect('/kitchen-alerts', 'PUT', {
    scope,
    target: categoryTarget,
    requestKey: randomUUID(),
    version: 0,
    thresholds: { warningSeconds: 20, criticalSeconds: 40 },
  });
  const send = async () => {
    const { order } = await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        items: [{ productId: f.product.id, quantity: '1' }],
      }),
    );
    return (
      await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
        version: order.version,
        requestKey: randomUUID(),
      })
    ).ticket;
  };
  const old = await send();
  expect(old.items[0].alertThresholds).toEqual({ warningSeconds: 20, criticalSeconds: 40 });
  const { category } = await f.a.primary.expect('/catalog/categories', 'POST', {
    name: 'Categorie nouă KDS',
  });
  await f.a.primary.expect(`/catalog/products/${f.product.id}`, 'PATCH', {
    version: f.product.version,
    name: f.product.name,
    sku: f.product.sku,
    categoryId: category.id,
  });
  const fresh = await send();
  expect(fresh.items[0].alertThresholds).toEqual({ warningSeconds: 600, criticalSeconds: 900 });
  const read = async () =>
    (await f.cook.expect(`/kitchen/tickets?locationId=${f.a.location.id}&status=QUEUED`)).tickets;
  expect((await read()).find((row: { id: string }) => row.id === old.id)).toEqual(old);
  await f.a.primary.expect('/kitchen-alerts', 'PUT', {
    scope,
    target: categoryTarget,
    requestKey: randomUUID(),
    version: 1,
    thresholds: { warningSeconds: 30, criticalSeconds: 60 },
  });
  expect(
    (await read()).find((row: { id: string }) => row.id === old.id).items[0].alertThresholds,
  ).toEqual({ warningSeconds: 30, criticalSeconds: 60 });
  const productRule = {
    scope: { scopeType: 'LOCATION', locationId: f.a.location.id },
    target: { kind: 'PRODUCT', productId: f.product.id },
  };
  await f.a.primary.expect('/kitchen-alerts', 'PUT', {
    ...productRule,
    requestKey: randomUUID(),
    version: 0,
    thresholds: { warningSeconds: 5, criticalSeconds: 10 },
  });
  for (const ticket of await read()) {
    expect(ticket.items[0].alertThresholds).toEqual({ warningSeconds: 5, criticalSeconds: 10 });
    expect(ticket.version).toBe(1);
  }
  await f.a.primary.expect('/kitchen-alerts', 'PUT', {
    ...productRule,
    requestKey: randomUUID(),
    version: 1,
    thresholds: null,
  });
  const restored = await read();
  expect(
    restored.find((row: { id: string }) => row.id === old.id).items[0].alertThresholds,
  ).toEqual({ warningSeconds: 30, criticalSeconds: 60 });
  expect(
    restored.find((row: { id: string }) => row.id === fresh.id).items[0].alertThresholds,
  ).toEqual({ warningSeconds: 600, criticalSeconds: 900 });
  expect(
    (await f.b.primary.expect(`/kitchen/tickets?locationId=${f.b.location.id}`)).tickets,
  ).toEqual([]);
});
