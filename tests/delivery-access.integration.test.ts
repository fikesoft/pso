import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareDelivery } from './api/delivery-setup';
import type { DeliveryFixture } from './api/delivery.types';
import { closeOperations } from './api/operations-setup';
import { db } from './api/support/harness';

let f: DeliveryFixture;
beforeAll(async () => {
  f = await prepareDelivery();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('enforces tenant, location, eligible courier and CSRF boundaries', async () => {
  const order = await f.create();
  await f.confirm(order.id);
  const path = `/orders/${order.id}/delivery`;
  const body = await f.command(order.id, 'ASSIGNED', { courierUserId: f.courier.user.id });
  const foreignUser = (await f.b.primary.expect('/auth/session')).user.id;
  for (const courierUserId of [f.outside.user.id, foreignUser])
    expect((await f.a.primary.call(path, 'POST', { ...body, courierUserId })).status).toBe(403);
  expect((await f.b.primary.call(path)).status).toBe(404);
  expect((await f.b.primary.call(path, 'POST', body)).status).toBe(404);
  const actor = await f.login();
  expect((await actor.call(path, 'POST', body)).status).toBe(403);
  expect((await actor.call(`/orders/${order.id}/delivery-couriers`)).status).toBe(403);
  expect((await f.a.primary.call(path, 'POST', body, {}, false)).status).toBe(403);
  expect(
    (await f.a.primary.call(path, 'POST', body, { origin: 'http://attacker.invalid' })).status,
  ).toBe(403);
  await f.a.primary.expect(path, 'POST', body);
  const outside = await f.login(f.outside.pin);
  expect((await outside.call(path)).status).toBe(403);
  expect(
    (
      await outside.call(
        path,
        'POST',
        await f.command(order.id, 'FAILED', { reason: 'Altă locație' }),
      )
    ).status,
  ).toBe(403);
  const other = await f.create();
  await f.confirm(other.id);
  expect(
    (
      await f.a.primary.call(`/orders/${other.id}/delivery`, 'POST', {
        ...body,
        version: (await f.current(other.id)).version,
      })
    ).status,
  ).toBe(409);
  await f.a.primary.expect(`/staff/${f.courier.user.id}/overrides`, 'POST', {
    permission: 'delivery.update',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.login();
  expect((await denied.expect(path)).canUpdate).toBe(false);
  expect(
    (
      await denied.call(
        path,
        'POST',
        await f.command(order.id, 'FAILED', { reason: 'Drept retras' }),
      )
    ).status,
  ).toBe(403);
  const candidates = await f.a.primary.expect(`/orders/${order.id}/delivery-couriers`);
  expect(candidates.couriers.map((c: { id: string }) => c.id)).not.toContain(f.courier.user.id);
});

it('reevaluates courier DENY during replay and preserves exactly one event', async () => {
  const order = await f.create();
  await f.confirm(order.id);
  const path = `/orders/${order.id}/delivery`;
  await f.a.primary.expect(
    path,
    'POST',
    await f.command(order.id, 'ASSIGNED', { courierUserId: f.second.user.id }),
  );
  const actor = await f.login(f.second.pin);
  const body = await f.command(order.id, 'FAILED', { reason: 'Client indisponibil' });
  const first = await actor.expect(path, 'POST', body);
  expect((await actor.expect(path, 'POST', body)).operation).toEqual(first.operation);
  await f.a.primary.expect(`/staff/${f.second.user.id}/overrides`, 'POST', {
    permission: 'delivery.update',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.login(f.second.pin);
  expect((await denied.call(path, 'POST', body)).status).toBe(403);
  const history = await f.a.primary.expect(path);
  expect(
    history.operations.filter((op: { id: string }) => op.id === first.operation.id),
  ).toHaveLength(1);
});

it('paginates immutable history without duplicates and rejects another order cursor', async () => {
  const order = await f.create();
  await f.confirm(order.id);
  const path = `/orders/${order.id}/delivery`;
  for (let index = 0; index < 52; index++) {
    const status = index % 2 === 0 ? 'FAILED' : 'WAITING_COURIER';
    await f.a.primary.expect(
      path,
      'POST',
      await f.command(order.id, status, { reason: 'Verificare paginare' }),
    );
  }
  const first = await f.a.primary.expect(path);
  expect(first.operations).toHaveLength(50);
  const second = await f.a.primary.expect(`${path}?cursor=${first.nextCursor}`);
  expect(second.operations).toHaveLength(2);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.operations, ...second.operations].map((op) => op.id)).size).toBe(52);
  const other = await f.create();
  expect(
    (await f.a.primary.call(`/orders/${other.id}/delivery?cursor=${first.nextCursor}`)).status,
  ).toBe(400);
  expect((await f.a.primary.call(`${path}?cursor=${randomUUID()}`)).status).toBe(400);
  const stored = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    (tx) => tx.deliveryOperation.count({ where: { orderId: order.id } }),
  );
  expect(stored).toBe(52);
});
