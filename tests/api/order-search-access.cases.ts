import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { OrderSearchFixture } from './order-search.types';

export async function verifySearchPaging(f: OrderSearchFixture) {
  const body = { customer: { name: 'Grup paginare', phone: '+373 60 999888' }, source: 'PHONE' };
  const expected = [];
  for (let index = 0; index < 3; index++) expected.unshift((await f.create(body)).id);
  const query = {
    customerName: 'grup paginare',
    customerPhone: '37360999888',
    source: 'PHONE',
    limit: 1,
  };
  const first = await f.search(query);
  expect(first.orders.map((entry: { id: string }) => entry.id)).toEqual([expected[0]]);
  expect(first.nextCursor).toEqual(expect.any(String));
  expect(first.nextCursor).not.toMatch(/^[0-9a-f-]{36}$/);
  expect(Buffer.from(first.nextCursor, 'base64url').toString('utf8')).not.toMatch(
    /Grup|paginare|37360999888/,
  );
  const newer = await f.create(body);
  const seen = [first.orders[0].id];
  let cursor = first.nextCursor;
  while (cursor) {
    const page = await f.search({ ...query, cursor });
    seen.push(...page.orders.map((entry: { id: string }) => entry.id));
    cursor = page.nextCursor;
  }
  expect(seen).toEqual(expected);
  expect(seen).not.toContain(newer.id);
  for (const change of [
    { source: 'POS' },
    { customerName: 'alt client' },
    { customerPhone: '060999888' },
    { number: 123456 },
    { status: 'CONFIRMED' },
    { createdFrom: '2001-01-01' },
    { createdByUserId: f.hidden.user.id },
  ]) {
    expect(
      (
        await f.a.primary.call('/orders/search', 'POST', {
          locationId: f.a.location.id,
          ...query,
          ...change,
          cursor: first.nextCursor,
        })
      ).status,
    ).toBe(400);
  }
  const differentActor = await f.loginSearch();
  expect(
    (
      await differentActor.call('/orders/search', 'POST', {
        locationId: f.a.location.id,
        ...query,
        cursor: first.nextCursor,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.a.primary.call(
        `/orders/creators?locationId=${f.a.location.id}&cursor=${encodeURIComponent(first.nextCursor)}`,
      )
    ).status,
  ).toBe(400);
  const damaged = `${first.nextCursor.slice(0, 8)}${first.nextCursor[8] === 'A' ? 'B' : 'A'}${first.nextCursor.slice(9)}`;
  expect(
    (
      await f.a.primary.call('/orders/search', 'POST', {
        locationId: f.a.location.id,
        ...query,
        cursor: damaged,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.a.primary.call('/orders/search', 'POST', {
        locationId: f.otherLocation.id,
        ...query,
        cursor: first.nextCursor,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.b.primary.call('/orders/search', 'POST', {
        locationId: f.b.location.id,
        ...query,
        cursor: first.nextCursor,
      })
    ).status,
  ).toBe(400);
  const legacy = await f.a.primary.expect(
    `/orders?locationId=${f.a.location.id}&cursor=${newer.id}&limit=1`,
  );
  expect(legacy.orders[0].number).toBeLessThan(newer.number);
  expect(legacy.nextCursor).not.toMatch(/^[0-9a-f-]{36}$/);
}

export async function verifySearchPermissions(f: OrderSearchFixture) {
  const reader = await f.loginSearch();
  const hidden = await f.loginSearch(f.hidden);
  const old = await f.create({ customer: { name: 'Client vizibil', phone: '060100200' } });
  let newestId = '';
  for (let index = 0; index < 201; index++) {
    newestId = (
      await f.create({ items: [{ productId: f.searchProduct.id, quantity: '10' }] }, hidden)
    ).id;
  }
  const first = await f.search({ limit: 2 }, reader);
  expect(first.orders).toHaveLength(0);
  expect(first.nextCursor).toEqual(expect.any(String));
  const second = await f.search({ limit: 2, cursor: first.nextCursor }, reader);
  expect(second.orders.map((entry: { id: string }) => entry.id)).toContain(old.id);
  expect(second.orders.every((entry: { total: string }) => Number(entry.total) <= 5)).toBe(true);
  expect((await reader.call(`/orders/${newestId}`)).status).toBe(403);
  const get = await reader.expect(`/orders?locationId=${f.a.location.id}&limit=2`);
  expect(get.orders).toHaveLength(0);
  expect(get.nextCursor).toBeTruthy();
  const visibleCreators = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await reader.expect(
      `/orders/creators?locationId=${f.a.location.id}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    page.creators.forEach((creator: { id: string }) => visibleCreators.add(creator.id));
    cursor = page.nextCursor;
  } while (cursor);
  expect(visibleCreators.has(f.hidden.user.id)).toBe(false);
  expect(visibleCreators.has(f.reader.user.id)).toBe(false);
  expect(visibleCreators.size).toBeGreaterThan(0);
  expect(
    (await reader.call('/orders/search', 'POST', { locationId: f.otherLocation.id })).status,
  ).toBe(403);
  expect(
    (await f.b.primary.call('/orders/search', 'POST', { locationId: f.a.location.id })).status,
  ).toBe(403);
  expect((await reader.call(`/orders/creators?locationId=${f.otherLocation.id}`)).status).toBe(403);
  await f.a.primary.expect(`/staff/${f.reader.user.id}/overrides`, 'POST', {
    permission: 'orders.read',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.loginSearch();
  expect(
    (
      await denied.call('/orders/search', 'POST', {
        locationId: f.a.location.id,
        cursor: first.nextCursor,
        limit: 2,
      })
    ).status,
  ).toBe(403);
  expect((await denied.call(`/orders/${old.id}`)).status).toBe(403);
  expect((await denied.call(`/orders/creators?locationId=${f.a.location.id}`)).status).toBe(403);
  expect(
    (await denied.call(`/orders?locationId=${f.a.location.id}&cursor=${randomUUID()}`)).status,
  ).toBe(403);
}
