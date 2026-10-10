import { completePacking } from './api/complete-packing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOrderLifecycle } from './api/order-lifecycle-setup';
import type { OrderLifecycleFixture } from './api/order-lifecycle.types';
import { closeOperations } from './api/operations-setup';
import { BrowserSession, fixturePasswords } from './api/support/harness';

let f: OrderLifecycleFixture;
beforeAll(async () => {
  f = await prepareOrderLifecycle();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

async function ready(quantity = '2') {
  const original = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        serviceType: 'PICKUP',
        tableLabel: undefined,
        items: [{ productId: f.product.id, quantity }],
      }),
    )
  ).order;
  const sent = await f.send(original.id);
  await f.prepare(sent.ticket.id, 1, 'PREPARING');
  await f.prepare(sent.ticket.id, 2, 'READY');
  return completePacking(f.a.primary, original.id);
}

it('completes independently once, with stock and an immutable event but no payment or receipt', async () => {
  const order = await ready();
  const path = `/orders/${order.id}/complete`;
  const body = { version: order.version, requestKey: randomUUID() };
  expect((await f.worker.call(path, 'POST', body)).status).toBe(403);
  expect((await f.b.primary.call(path, 'POST', body)).status).toBe(404);
  expect(
    (await f.a.primary.call(path, 'POST', { ...body, version: body.version - 1 })).status,
  ).toBe(409);
  expect((await f.stock()).reservedQuantity).toBe('2.000000');
  const results = await Promise.all([
    f.a.primary.expect(path, 'POST', body),
    f.a.primary.expect(path, 'POST', body),
  ]);
  expect(results[0].order).toEqual(results[1].order);
  expect(results[0].order).toMatchObject({
    status: 'COMPLETED',
    kitchenStatus: 'READY',
    version: order.version + 1,
    checkout: null,
  });
  const stored = await f.stored(order.id);
  expect(stored).toMatchObject({ payments: 0, documents: 1, reservation: { status: 'CONSUMED' } });
  const completion = stored.events.filter(
    (event) => event.kind === 'ORDER' && event.toStatus === 'COMPLETED',
  );
  expect(completion).toHaveLength(1);
  expect(completion[0]).toMatchObject({
    requestKey: body.requestKey,
    orderVersion: results[0].order.version,
    actorUserId: stored.order.updatedByUserId,
  });
  expect((await f.a.primary.call(`/orders/${order.id}/receipt`)).status).toBe(404);
  expect((await f.stock()).reservedQuantity).toBe('0.000000');
  expect((await f.stock()).balance).toBe('-2.000000');
  expect(
    (await f.a.primary.call(path, 'POST', { ...body, version: body.version + 1 })).status,
  ).toBe(409);
  expect((await f.a.primary.call(path, 'POST', { ...body, requestKey: randomUUID() })).status).toBe(
    409,
  );
  expect(
    (
      await f.a.primary.call(`/orders/${order.id}/cancel`, 'POST', {
        version: results[0].order.version,
        reason: 'Comanda este închisă',
      })
    ).status,
  ).toBe(409);
  const board = await f.cook.expect(`/kitchen/tickets?locationId=${f.a.location.id}`);
  expect(board.tickets.map((ticket: { orderId: string }) => ticket.orderId)).not.toContain(
    order.id,
  );
});

it('rejects completion before preparation and races safely with the existing checkout', async () => {
  const original = await f.create();
  for (const step of ['DRAFT', 'CONFIRMED', 'PREPARING', 'PARTIALLY_READY']) {
    const current = await f.current(original.id);
    expect(
      (
        await f.a.primary.call(`/orders/${original.id}/complete`, 'POST', {
          version: current.version,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(409);
    if (step === 'DRAFT') await f.confirm(original.id);
    else if (step === 'CONFIRMED') {
      const sent = await f.send(original.id);
      await f.prepare(sent.ticket.id, 1, 'PREPARING');
    } else if (step === 'PREPARING') {
      const ticket = (await f.stored(original.id)).ticket!;
      await f.prepare(ticket.id, ticket.version, 'PARTIALLY_READY');
    }
  }
  const ticket = (await f.stored(original.id)).ticket!;
  await f.prepare(ticket.id, ticket.version, 'READY');
  const prepared = await f.current(original.id);
  expect(
    (
      await f.a.primary.call(`/orders/${original.id}/complete`, 'POST', {
        version: prepared.version,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  const order = await completePacking(f.a.primary, original.id);
  const body = { version: order.version, requestKey: randomUUID() };
  const responses = await Promise.all([
    f.a.primary.call(`/orders/${order.id}/complete`, 'POST', body),
    f.a.primary.call(`/orders/${order.id}/checkout/manual`, 'POST', {
      ...body,
      requestKey: randomUUID(),
      method: 'CARD',
      cashShiftId: (await f.cashShift()).id,
      confirmed: true,
    }),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  const stored = await f.stored(order.id);
  expect(stored.documents).toBe(1);
  expect(stored.reservation?.status).toBe('CONSUMED');
  expect(stored.payments).toBe(responses[1]!.status === 200 ? 1 : 0);
  expect(
    stored.events.filter((event) => event.kind === 'ORDER' && event.toStatus === 'COMPLETED'),
  ).toHaveLength(1);
});

it('allows a delegated PIN operator without collection rights, respects scope and reevaluates DENY on replay', async () => {
  const order = await ready();
  const overLimit = await ready('4');
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Finalizare operațională locală',
      permissions: [
        { permission: 'orders.complete', limits: { maxAmount: '30.00' } },
        { permission: 'orders.read' },
        ...['cash.registers.read', 'cash.shifts.read', 'cash.shifts.open'].map((permission) => ({
          permission,
        })),
      ],
    })
  ).role;
  const created = await f.a.primary.expect('/staff', 'POST', {
    login: 'finalizare-pin',
    displayName: 'Operator finalizare',
    authenticationMethod: 'PIN',
    locationIds: [f.a.location.id],
    assignments: [
      {
        roleVersionId: role.versions[0].id,
        scopeType: 'LOCATION',
        locationId: f.a.location.id,
      },
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
  const actor = await login();
  expect(
    (
      await actor.call(`/orders/${overLimit.id}/complete`, 'POST', {
        version: overLimit.version,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(403);
  expect((await f.stored(overLimit.id)).reservation?.status).toBe('PENDING');
  const body = { version: order.version, requestKey: randomUUID() };
  expect(
    (
      await actor.call(`/orders/${order.id}/checkout/manual`, 'POST', {
        ...body,
        method: 'CARD',
        cashShiftId: (await f.cashShift(actor)).id,
        confirmed: true,
      })
    ).status,
  ).toBe(403);
  const complete = await actor.expect(`/orders/${order.id}/complete`, 'POST', body);
  expect(complete.order.status).toBe('COMPLETED');
  const product = (
    await f.a.primary.expect('/catalog/products', 'POST', {
      locationId: f.otherLocation.id,
      name: 'Alt produs',
      sku: randomUUID(),
      price: '1',
    })
  ).product;
  const other = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        locationId: f.otherLocation.id,
        items: [{ productId: product.id, quantity: '1' }],
      }),
    )
  ).order;
  expect(
    (
      await actor.call(`/orders/${other.id}/complete`, 'POST', {
        version: 1,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(403);
  await f.a.primary.expect(`/staff/${created.user.id}/overrides`, 'POST', {
    permission: 'orders.complete',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await login();
  expect((await denied.call(`/orders/${order.id}/complete`, 'POST', body)).status).toBe(403);
  expect((await f.stored(order.id)).documents).toBe(1);
});
