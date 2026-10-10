import { expect } from 'vitest';
import type { OrderRepeatFixture } from './order-repeat.types';

export async function verifyLastCustomerOrder(f: OrderRepeatFixture) {
  const customer = (await f.a.primary.expect('/customers', 'POST', f.registration())).customer;
  const path = `/customers/${customer.id}/last-order?locationId=${f.a.location.id}`;
  expect(await f.a.primary.expect(path)).toEqual({ order: null, nextCursor: null });
  const linked = { customerRef: { id: customer.id, version: 1 } };
  const cheap = await f.complete({
    ...linked,
    items: [{ productId: f.secondProduct.id, quantity: '0.1' }],
  });
  const expensive = await f.complete(linked);
  await f.create(linked);
  const confirmed = await f.create(linked);
  await f.confirm(confirmed.id);
  await f.complete({ customer: { name: customer.name, phone: customer.phone } });
  const response = await f.a.primary.call(path);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.data.order.id).toBe(expensive.id);
  expect(response.data.order.status).toBe('COMPLETED');
  expect(Object.keys(response.data.order).sort()).toEqual([
    'createdAt',
    'currency',
    'id',
    'locationId',
    'number',
    'status',
    'total',
    'version',
  ]);
  const limited = await f.loginRepeat(f.limitedRead);
  expect((await limited.expect(path)).order.id).toBe(cheap.id);
  expect(
    await f.a.primary.expect(
      `/customers/${customer.id}/last-order?locationId=${f.otherLocation.id}`,
    ),
  ).toEqual({ order: null, nextCursor: null });
  expect(
    (await f.b.primary.call(`/customers/${customer.id}/last-order?locationId=${f.b.location.id}`))
      .status,
  ).toBe(404);
  expect((await (await f.loginCustomer(f.basic)).call(path)).status).toBe(403);
}

export async function verifyLastOrderPagination(f: OrderRepeatFixture) {
  const customer = (await f.a.primary.expect('/customers', 'POST', f.registration())).customer;
  const linked = { customerRef: { id: customer.id, version: 1 } };
  const oldest = await f.complete(linked);
  const newest = await f.complete(linked);
  const path = `/customers/${customer.id}/last-order?locationId=${f.a.location.id}`;
  const actor = await f.loginRepeat();
  const first = await actor.expect(path);
  expect(first.order.id).toBe(newest.id);
  expect(first.nextCursor).toBeNull();
  const catalog = await actor.expect(`/catalog?locationId=${f.a.location.id}&limit=1`);
  expect(catalog.nextCursor).toBeTruthy();
  expect(
    (await actor.call(`${path}&cursor=${encodeURIComponent(catalog.nextCursor)}`)).status,
  ).toBe(400);
  expect((await actor.call(`${path}&cursor=${oldest.id}`)).status).toBe(400);
}
