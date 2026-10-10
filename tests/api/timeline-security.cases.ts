import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { OrderTimelineResponse } from '../../packages/contracts/src';
import type { OrderLifecycleFixture } from './order-lifecycle.types';
import { BrowserSession, fixturePasswords, noSecrets } from './support/harness';

export async function verifyTimelinePagination(f: OrderLifecycleFixture) {
  let order = await f.create();
  const update = async () => {
    order = (
      await f.a.primary.expect(`/orders/${order.id}`, 'PATCH', {
        version: order.version,
        serviceType: 'PICKUP',
        items: [{ id: order.items[0].id, productId: f.product.id, quantity: '2' }],
      })
    ).order;
  };
  for (let index = 0; index < 52; index++) await update();
  const path = `/orders/${order.id}/timeline`;
  const first: OrderTimelineResponse = await f.a.primary.expect(path);
  expect(first.events).toHaveLength(50);
  expect(first.nextCursor).toEqual(expect.any(String));
  await update();
  const next: OrderTimelineResponse = await f.a.primary.expect(
    `${path}?cursor=${encodeURIComponent(first.nextCursor!)}`,
  );
  expect(next.events).toHaveLength(3);
  expect(next.nextCursor).toBeNull();
  const entries = [...first.events, ...next.events];
  expect(new Set(entries.map((event) => event.id)).size).toBe(53);
  expect(entries.map((event) => event.orderVersion)).toEqual(
    Array.from({ length: 53 }, (_, index) => 53 - index),
  );
  const fresh: OrderTimelineResponse = await f.a.primary.expect(path);
  expect(fresh.events[0]?.orderVersion).toBe(54);
  expect(entries.map((event) => event.id)).not.toContain(fresh.events[0]!.id);
  noSecrets({ first, next });
  const other = await f.create();
  expect(
    (
      await f.a.primary.call(
        `/orders/${other.id}/timeline?cursor=${encodeURIComponent(first.nextCursor!)}`,
      )
    ).status,
  ).toBe(400);
  const decoded = Buffer.from(first.nextCursor!, 'base64url').toString('utf8');
  const tampered = Buffer.from(
    decoded.replace(/[0-9]/, (digit) => (digit === '0' ? '1' : '0')),
  ).toString('base64url');
  expect((await f.a.primary.call(`${path}?cursor=${tampered}`)).status).toBe(400);
  for (const query of ['cursor=invalid', 'cursor=', 'cursor=x&cursor=y'])
    expect((await f.a.primary.call(`${path}?${query}`)).status).toBe(400);
  expect((await f.b.primary.call(`${path}?cursor=${first.nextCursor}`)).status).toBe(404);
}

export async function verifyTimelineAccess(f: OrderLifecycleFixture) {
  const order = await f.create();
  const path = `/orders/${order.id}/timeline`;
  const anonymous = new BrowserSession('TENANT');
  expect((await anonymous.call(path)).status).toBe(401);
  expect((await f.b.primary.call(path)).status).toBe(404);
  const product = (
    await f.a.primary.expect('/catalog/products', 'POST', {
      locationId: f.otherLocation.id,
      name: 'Nord cronologie',
      sku: randomUUID(),
      price: '1',
    })
  ).product;
  const outside = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        locationId: f.otherLocation.id,
        items: [{ productId: product.id, quantity: '1' }],
      }),
    )
  ).order;
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Cronologie locală',
      permissions: [{ permission: 'orders.read' }],
    })
  ).role;
  const created = await f.a.primary.expect('/staff', 'POST', {
    login: 'cronologie-pin',
    displayName: 'Cititor cronologie',
    authenticationMethod: 'PIN',
    locationIds: [f.a.location.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
    ],
  });
  fixturePasswords.add(created.pin);
  const login = async () => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: created.pin,
    });
    return session;
  };
  const allowed = await login();
  expect((await allowed.call(path)).status).toBe(200);
  expect((await allowed.call(`/orders/${outside.id}/timeline`)).status).toBe(403);
  await f.a.primary.expect(`/staff/${created.user.id}/overrides`, 'POST', {
    permission: 'orders.read',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  expect((await allowed.call(path)).status).not.toBe(200);
  expect((await (await login()).call(path)).status).toBe(403);
}
