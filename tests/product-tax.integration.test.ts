import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations, prepareOperations } from './api/operations-setup';
import type { OperationsFixture } from './api/operations.types';

let fixture: OperationsFixture;
beforeAll(async () => {
  fixture = await prepareOperations();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

it('configures product tax only through organization catalog management, with versions and audit', async () => {
  const { a, b, manager, product, worker, draft } = fixture;
  expect(product.taxRate).toBeNull();
  const read = async () =>
    (await worker.expect(`/catalog/products/${product.id}?locationId=${a.location.id}`)).product;
  const path = `/catalog/products/${product.id}`;
  const body = { version: product.version, taxRate: '7.1250' };
  expect((await manager.call(path, 'PATCH', body)).status).toBe(403);
  expect((await b.primary.call(path, 'PATCH', body)).status).toBe(404);
  for (const taxRate of ['100.0001', '-1', '7.12345', '', 7])
    expect((await a.primary.call(path, 'PATCH', { ...body, taxRate })).status).toBe(400);
  const original = (
    await worker.expect(
      '/orders',
      'POST',
      draft({ items: [{ productId: product.id, quantity: '1' }] }),
    )
  ).order;
  const writes = await Promise.all([
    a.primary.call(path, 'PATCH', body),
    a.primary.call(path, 'PATCH', { ...body, taxRate: '8.0000' }),
  ]);
  expect(writes.map((value) => value.status).sort()).toEqual([200, 409]);
  const saved = writes.find((value) => value.status === 200)!.data.product;
  expect((await read()).taxRate).toBe(saved.taxRate);
  expect((await read()).price).toBe(product.price);
  expect((await worker.expect(`/orders/${original.id}`)).order.total).toBe(original.total);
  const zero = (await a.primary.expect(path, 'PATCH', { version: saved.version, taxRate: '0' }))
    .product;
  expect(zero.taxRate).toBe('0.0000');
  const cleared = (await a.primary.expect(path, 'PATCH', { version: zero.version, taxRate: null }))
    .product;
  expect(cleared.taxRate).toBeNull();
  expect((await read()).taxRate).toBeNull();
  const created = (
    await a.primary.expect('/catalog/products', 'POST', {
      locationId: a.location.id,
      name: 'Produs cu taxă',
      sku: 'TAX-NEW',
      price: '15.1000',
      taxRate: '7.1250',
    })
  ).product;
  expect(created.taxRate).toBe('7.1250');
  const catalog = await manager.expect(`/catalog?locationId=${a.location.id}`);
  expect(catalog.products.find((entry: { id: string }) => entry.id === created.id).taxRate).toBe(
    '7.1250',
  );
  const audits = await a.primary.expect('/audit');
  expect(
    audits.events.some(
      (entry: { action: string; targetId: string }) =>
        entry.action === 'catalog.product.updated' && entry.targetId === product.id,
    ),
  ).toBe(true);
});
