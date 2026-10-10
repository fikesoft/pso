import { expect } from 'vitest';
import type { OperationsFixture } from './operations.types';

export async function verifyOperationalAccess(f: OperationsFixture) {
  const catalog = await f.worker.expect(`/catalog?locationId=${f.a.location.id}`);
  expect(catalog.products.some((p: any) => p.id === f.secondProduct.id)).toBe(true);
  expect((await f.cook.call(`/catalog?locationId=${f.a.location.id}`)).status).toBe(403);
  for (const path of ['catalog', 'orders', 'kitchen/tickets']) {
    expect((await f.worker.call(`/${path}?locationId=${f.otherLocation.id}`)).status).toBe(403);
    expect((await f.b.primary.call(`/${path}?locationId=${f.a.location.id}`)).status).toBe(403);
    expect((await f.worker.call(`/${path}`)).status).toBe(400);
  }
  expect(
    (await f.worker.call('/orders', 'POST', f.draft({ locationId: f.otherLocation.id }))).status,
  ).toBe(403);
  expect(
    (await f.b.primary.call('/orders', 'POST', f.draft({ locationId: f.b.location.id }))).status,
  ).toBe(404);
  expect(
    (await f.manager.call('/catalog/categories', 'POST', { name: 'Global interzis' })).status,
  ).toBe(403);
  expect(
    (
      await f.manager.call(`/catalog/products/${f.secondProduct.id}`, 'PATCH', {
        version: 1,
        name: 'Global interzis',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.worker.call('/catalog/products', 'POST', {
        locationId: f.a.location.id,
        name: 'Interzis',
        sku: 'X',
        price: '1',
      })
    ).status,
  ).toBe(403);
  await f.manager.expect(
    `/catalog/products/${f.secondProduct.id}/locations/${f.a.location.id}`,
    'PUT',
    {
      version: 1,
      price: '5.2500',
      enabled: false,
    },
  );
  expect((await f.worker.call('/orders', 'POST', f.draft())).status).toBe(409);
  expect(
    (
      await f.manager.call(
        `/catalog/products/${f.secondProduct.id}/locations/${f.a.location.id}`,
        'PUT',
        {
          version: 1,
          price: '5.2500',
          enabled: true,
        },
      )
    ).status,
  ).toBe(409);
  await f.manager.expect(
    `/catalog/products/${f.secondProduct.id}/locations/${f.a.location.id}`,
    'PUT',
    {
      version: 2,
      price: '5.2500',
      enabled: true,
    },
  );
  const order = (
    await f.worker.expect(
      '/orders',
      'POST',
      f.draft({ serviceType: 'TAKEAWAY', tableLabel: undefined }),
    )
  ).order;
  expect((await f.b.primary.call(`/orders/${order.id}`)).status).toBe(404);
  expect((await f.cook.call(`/orders/${order.id}`)).status).toBe(403);
  await f.worker.expect(`/orders/${order.id}/cancel`, 'POST', { version: 1 });
  expect((await f.worker.expect(`/orders/${order.id}`)).order.status).toBe('CANCELLED');
  expect((await f.worker.call(`/orders/${order.id}/cancel`, 'POST', { version: 2 })).status).toBe(
    409,
  );
}
