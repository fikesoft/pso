import { expect } from 'vitest';
import type { ActiveOrder } from '../../packages/contracts/src';
import type { ActiveOrdersFixture } from './active-orders.types';

export async function verifyActiveAccess(f: ActiveOrdersFixture) {
  const large = await f.create();
  const cheap = await f.create({ items: [{ productId: f.secondProduct.id, quantity: '0.1' }] });
  const limited = await f.loginRepeat(f.limitedRead);
  const result = await f.list('', limited);
  expect(result.orders.map((o: ActiveOrder) => o.id)).toContain(cheap.id);
  expect(result.orders.map((o: ActiveOrder) => o.id)).not.toContain(large.id);
  expect((await limited.call(`/orders/${large.id}`)).status).toBe(403);
  expect((await (await f.loginActor(f.creator)).call(f.path())).status).toBe(403);
  expect((await f.b.primary.call(f.path())).status).toBe(403);
  const local = await f.loginCustomer(f.basic);
  expect((await local.call(f.path('', f.otherLocation.id))).status).toBe(403);
  expect((await f.list('', await f.loginRepeat())).orders.length).toBeGreaterThan(0);
  await f.a.primary.expect(`/staff/${f.full.user.id}/overrides`, 'POST', {
    permission: 'orders.read',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  expect((await (await f.loginRepeat()).call(f.path())).status).toBe(403);
}

export async function verifyActiveCursor(f: ActiveOrdersFixture) {
  const ids: string[] = [];
  for (let i = 0; i < 52; i++) ids.push((await f.create()).id);
  const first = await f.list();
  expect(first.orders).toHaveLength(50);
  expect(first.orders.map((o: ActiveOrder) => o.id)).toEqual(ids.slice(-50).reverse());
  expect(first.nextCursor).toEqual(expect.any(String));
  const anchor = first.orders.at(-1);
  await f.command(anchor.id, 'cancel', { reason: 'Anchor devine inactiv' });
  const inserted = await f.create();
  const second = await f.list(`&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`);
  expect(second.orders.map((o: ActiveOrder) => o.id)).toEqual([ids[1]]);
  expect(
    second.orders.some((o: ActiveOrder) => first.orders.some((p: ActiveOrder) => p.id === o.id)),
  ).toBe(false);
  expect(second.orders.map((o: ActiveOrder) => o.id)).not.toContain(inserted.id);
  expect((await f.list('&limit=1')).orders[0].id).toBe(inserted.id);
  const cursor = encodeURIComponent(first.nextCursor);
  expect((await f.a.primary.call(f.path(`&cursor=${cursor}`, f.otherLocation.id))).status).toBe(
    400,
  );
  expect(
    (await (await f.loginRepeat(f.limitedCreate)).call(f.path(`&cursor=${cursor}`))).status,
  ).toBe(400);
  expect((await f.b.primary.call(f.path(`&cursor=${cursor}`, f.b.location.id))).status).toBe(400);
  expect((await f.a.primary.call(f.path(`&cursor=${anchor.id}`))).status).toBe(400);
  const modified = `${first.nextCursor.slice(0, 8)}X${first.nextCursor.slice(9)}`;
  expect((await f.a.primary.call(f.path(`&cursor=${encodeURIComponent(modified)}`))).status).toBe(
    400,
  );
  const generic = await f.a.primary.expect(`/orders?locationId=${f.a.location.id}&limit=1`);
  expect(generic.nextCursor).toEqual(expect.any(String));
  expect(
    (await f.a.primary.call(f.path(`&cursor=${encodeURIComponent(generic.nextCursor)}`))).status,
  ).toBe(400);
  await f.a.primary.expect(`/staff/${f.limitedCreate.user.id}/overrides`, 'POST', {
    permission: 'orders.read',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  expect(
    (await (await f.loginRepeat(f.limitedCreate)).call(f.path(`&cursor=${cursor}`))).status,
  ).toBe(403);
}

export async function verifyActivePredicate(f: ActiveOrdersFixture) {
  const target = await f.create({ items: [{ productId: f.secondProduct.id, quantity: '0.1' }] });
  for (let i = 0; i < 55; i++) {
    const inactive = await f.create();
    await f.command(inactive.id, 'cancel', { reason: 'Comandă nouă inactivă' });
  }
  expect((await f.list('&limit=1')).orders.map((o: ActiveOrder) => o.id)).toEqual([target.id]);
  for (let i = 0; i < 12; i++) await f.create();
  const limited = await f.loginRepeat(f.limitedRead);
  const first = await f.list('&limit=1', limited);
  expect(first.orders.map((o: ActiveOrder) => o.id)).toEqual([target.id]);
  expect(first.nextCursor).toEqual(expect.any(String));
  const second = await f.list(`&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`, limited);
  expect(second.orders).toHaveLength(1);
  expect(second.orders[0].id).not.toBe(target.id);
  expect(Number(second.orders[0].total)).toBeLessThanOrEqual(5);
}
