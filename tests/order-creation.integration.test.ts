import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOrderCreation } from './api/order-creation-setup';
import type { OrderCreationFixture } from './api/order-creation.types';
import { closeOperations } from './api/operations-setup';
import { verifyCreationAuthorization } from './api/order-creation-access.cases';
import { db, noSecrets } from './api/support/harness';

let f: OrderCreationFixture;
beforeAll(async () => {
  f = await prepareOrderCreation();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

async function effects(requestKey: string) {
  return db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    async (tx) => {
      const orders = await tx.order.findMany({
        where: { locationId: f.a.location.id, clientRequestId: requestKey },
      });
      const ids = orders.map((order) => order.id);
      return {
        orders,
        lines: await tx.orderItem.count({ where: { orderId: { in: ids } } }),
        events: await tx.orderStatusEvent.count({ where: { orderId: { in: ids } } }),
        audits: await tx.auditEvent.count({
          where: { action: 'orders.created', targetId: { in: ids } },
        }),
        tickets: await tx.kitchenTicket.count({ where: { orderId: { in: ids } } }),
        payments: await tx.payment.count({ where: { orderId: { in: ids } } }),
      };
    },
  );
}

it('serializes conflicting payloads under one key and allocates unique numbers for distinct concurrent keys', async () => {
  const writer = await f.login();
  const body = f.draft();
  const results = await Promise.all([
    writer.call('/orders', 'POST', body),
    writer.call('/orders', 'POST', { ...body, tableLabel: '99' }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const stored = await effects(body.requestKey);
  expect(stored.orders).toHaveLength(1);
  expect(stored).toMatchObject({ lines: 1, events: 1, audits: 1, tickets: 0, payments: 0 });
  const distinct = await Promise.all(
    Array.from({ length: 3 }, () => writer.expect('/orders', 'POST', f.draft())),
  );
  expect(new Set(distinct.map((result) => result.order.id)).size).toBe(3);
  expect(new Set(distinct.map((result) => result.order.number)).size).toBe(3);
});

it('validates the optional idempotency header against the strict body before persisting', async () => {
  const body = f.draft();
  const mismatch = await f.a.primary.call('/orders', 'POST', body, {
    'Idempotency-Key': randomUUID(),
  });
  expect(mismatch.status).toBe(400);
  expect((await effects(body.requestKey)).orders).toHaveLength(0);
  const accepted = await f.a.primary.call('/orders', 'POST', body, {
    'Idempotency-Key': body.requestKey,
  });
  expect(accepted.status).toBe(200);
  const replay = await f.a.primary.expect('/orders', 'POST', body);
  expect(replay.order.id).toBe(accepted.data.order.id);
  expect((await effects(body.requestKey)).orders).toHaveLength(1);
  const resolution = { locationId: f.a.location.id, requestKey: body.requestKey };
  expect(
    (
      await f.a.primary.call('/orders/creation-resolution', 'POST', resolution, {
        'Idempotency-Key': randomUUID(),
      })
    ).status,
  ).toBe(400);
  const resolved = await f.a.primary.call('/orders/creation-resolution', 'POST', resolution, {
    'Idempotency-Key': body.requestKey,
  });
  expect(resolved.status).toBe(200);
  expect(resolved.data).toMatchObject({ status: 'CREATED', order: { id: accepted.data.order.id } });
});

it('resolves a committed creation repeatedly to its current order without replaying the creation', async () => {
  const body = f.draft();
  const order = (await f.a.primary.expect('/orders', 'POST', body)).order;
  await f.a.primary.expect(`/orders/${order.id}`, 'PATCH', {
    version: 1,
    serviceType: 'PICKUP',
    items: [{ id: order.items[0].id, productId: f.secondProduct.id, quantity: '3' }],
  });
  const resolution = { locationId: f.a.location.id, requestKey: body.requestKey };
  const [first, second] = await Promise.all([
    f.a.primary.expect('/orders/creation-resolution', 'POST', resolution),
    f.a.primary.expect('/orders/creation-resolution', 'POST', resolution),
  ]);
  expect(first).toEqual(second);
  expect(first).toMatchObject({
    status: 'CREATED',
    order: { id: order.id, version: 2, total: '15.75' },
  });
  noSecrets(first);
  expect(await effects(body.requestKey)).toMatchObject({ events: 1, audits: 1, lines: 1 });
});

it('retires an absent key durably and rejects every delayed original while allowing a fresh key', async () => {
  const body = f.draft();
  const resolution = { locationId: f.a.location.id, requestKey: body.requestKey };
  const first = await f.a.primary.expect('/orders/creation-resolution', 'POST', resolution);
  expect(first).toEqual({ status: 'RETIRED', ...resolution });
  expect(await f.a.primary.expect('/orders/creation-resolution', 'POST', resolution)).toEqual(
    first,
  );
  for (const payload of [body, { ...body, tableLabel: '99' }]) {
    const delayed = await f.a.primary.call('/orders', 'POST', payload);
    expect(delayed.status).toBe(409);
    expect(delayed.data.code).toBe('ORDER_CREATION_RETIRED');
  }
  expect((await effects(body.requestKey)).orders).toHaveLength(0);
  await f.a.primary.expect('/orders', 'POST', { ...body, requestKey: randomUUID() });
  expect(await f.a.primary.expect('/orders/creation-resolution', 'POST', resolution)).toEqual(
    first,
  );
});

it('gives creation and retirement one durable winner under concurrent HTTP commands', async () => {
  for (let index = 0; index < 4; index++) {
    const body = f.draft();
    const resolution = { locationId: f.a.location.id, requestKey: body.requestKey };
    const [created, resolved] = await Promise.all([
      f.a.primary.call('/orders', 'POST', body),
      f.a.primary.call('/orders/creation-resolution', 'POST', resolution),
    ]);
    expect(resolved.status).toBe(200);
    const stored = await effects(body.requestKey);
    if (resolved.data.status === 'CREATED') {
      expect(created.status).toBe(200);
      expect(resolved.data.order.id).toBe(created.data.order.id);
      expect(stored).toMatchObject({ events: 1, audits: 1, lines: 1 });
      expect(stored.orders).toHaveLength(1);
    } else {
      expect(resolved.data.status).toBe('RETIRED');
      expect(created.status).toBe(409);
      expect(created.data.code).toBe('ORDER_CREATION_RETIRED');
      expect(stored.orders).toHaveLength(0);
    }
    expect(await f.a.primary.expect('/orders/creation-resolution', 'POST', resolution)).toEqual(
      resolved.data,
    );
  }
});

it('requires current creation scope and amount limits for replay and resolution, including DENY and withdrawn location', async () => {
  await verifyCreationAuthorization(f);
});
