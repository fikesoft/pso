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

it('confirms once without kitchen, stock or payment effects and freezes the saved lines', async () => {
  const original = await f.create();
  const body = { version: original.version, requestKey: randomUUID() };
  expect((await f.cook.call(`/orders/${original.id}/confirm`, 'POST', body)).status).toBe(403);
  expect((await f.b.primary.call(`/orders/${original.id}/confirm`, 'POST', body)).status).toBe(404);
  const [a, b] = await Promise.all([
    f.worker.expect(`/orders/${original.id}/confirm`, 'POST', body),
    f.worker.expect(`/orders/${original.id}/confirm`, 'POST', body),
  ]);
  expect(a.order).toEqual(b.order);
  expect(a.order).toMatchObject({
    status: 'CONFIRMED',
    kitchenStatus: 'NOT_SENT',
    version: 2,
    total: original.total,
  });
  const stored = await f.stored(original.id);
  expect(stored).toMatchObject({ reservation: null, ticket: null, documents: 0, payments: 0 });
  expect(stored.events.filter((event) => event.toStatus === 'CONFIRMED')).toHaveLength(1);
  expect(
    (await f.worker.call(`/orders/${original.id}/confirm`, 'POST', { ...body, version: 2 })).status,
  ).toBe(409);
  expect(
    (
      await f.worker.call(`/orders/${original.id}`, 'PATCH', {
        version: 2,
        serviceType: 'PICKUP',
        items: [{ id: original.items[0].id, productId: f.product.id, quantity: '3' }],
      })
    ).status,
  ).toBe(409);
  const cancelled = await f.a.primary.expect(`/orders/${original.id}/cancel`, 'POST', {
    version: 2,
    requestKey: randomUUID(),
    reason: 'Confirmare anulată înainte de trimitere',
  });
  expect(cancelled.order.status).toBe('CANCELLED');
  expect((await f.worker.expect(`/orders/${original.id}/confirm`, 'POST', body)).order.status).toBe(
    'CANCELLED',
  );
});

it('sends a confirmed order, separates partial preparation, and records each order stage once', async () => {
  const original = await f.create();
  await f.confirm(original.id);
  const sent = await f.send(original.id);
  expect(sent.order).toMatchObject({ status: 'CONFIRMED', kitchenStatus: 'QUEUED', version: 3 });
  expect((await f.stored(original.id)).reservation?.status).toBe('PENDING');
  expect(
    (
      await f.a.primary.call(`/orders/${original.id}/checkout/manual`, 'POST', {
        version: 3,
        requestKey: randomUUID(),
        method: 'CARD',
        cashShiftId: (await f.cashShift()).id,
        confirmed: true,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await f.cook.call(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
        version: 1,
        status: 'READY',
      })
    ).status,
  ).toBe(409);
  await f.prepare(sent.ticket.id, 1, 'PREPARING');
  expect((await f.current(original.id)).status).toBe('IN_PROGRESS');
  await f.prepare(sent.ticket.id, 2, 'PARTIALLY_READY');
  expect(await f.current(original.id)).toMatchObject({
    status: 'IN_PROGRESS',
    kitchenStatus: 'PARTIALLY_READY',
  });
  const partial = await f.cook.expect(
    `/kitchen/tickets?locationId=${f.a.location.id}&status=PARTIALLY_READY`,
  );
  expect(partial.tickets.map((ticket: { id: string }) => ticket.id)).toContain(sent.ticket.id);
  await f.prepare(sent.ticket.id, 3, 'READY');
  expect(await f.current(original.id)).toMatchObject({
    status: 'IN_PROGRESS',
    kitchenStatus: 'READY',
    packingStatus: 'WAITING',
    version: 6,
  });
  const ready = await completePacking(f.a.primary, original.id);
  expect(ready).toMatchObject({
    status: 'READY',
    kitchenStatus: 'READY',
    packingStatus: 'READY',
    version: 7,
  });
  const listed = await f.worker.expect(`/orders?locationId=${f.a.location.id}&status=READY`);
  expect(listed.orders.map((order: { id: string }) => order.id)).toContain(original.id);
  const body = {
    version: ready.version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
  };
  const paid = await f.a.primary.expect(`/orders/${original.id}/checkout/manual`, 'POST', body);
  expect(paid.order.status).toBe('COMPLETED');
  const stored = await f.stored(original.id);
  expect(stored.reservation?.status).toBe('CONSUMED');
  expect(
    stored.events.filter((event) => event.kind === 'ORDER').map((event) => event.toStatus),
  ).toEqual(['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'READY', 'COMPLETED']);
  expect(
    (
      await f.a.primary.call(`/orders/${original.id}/cancel`, 'POST', {
        version: paid.order.version,
        reason: 'Nu se rescrie încasarea',
      })
    ).status,
  ).toBe(409);
});

it('cancels at every nonterminal kitchen stage with one reason and releases stock without consumption', async () => {
  for (const stage of ['QUEUED', 'PREPARING', 'PARTIALLY_READY', 'READY']) {
    const original = await f.create();
    const sent = await f.send(original.id);
    if (stage !== 'QUEUED') await f.prepare(sent.ticket.id, 1, 'PREPARING');
    if (stage === 'PARTIALLY_READY' || stage === 'READY') await f.prepare(sent.ticket.id, 2, stage);
    const current = await f.current(original.id);
    expect((await f.stock()).reservedQuantity).toBe('2.000000');
    expect(
      (
        await f.worker.call(`/orders/${original.id}/cancel`, 'POST', {
          version: current.version,
          reason: 'Fără drept de anulare',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await f.a.primary.call(`/orders/${original.id}/cancel`, 'POST', {
          version: current.version,
        })
      ).status,
    ).toBe(400);
    const body = {
      version: current.version,
      requestKey: randomUUID(),
      reason: `Anulare sintetică ${stage}`,
    };
    const [a, b] = await Promise.all([
      f.a.primary.expect(`/orders/${original.id}/cancel`, 'POST', body),
      f.a.primary.expect(`/orders/${original.id}/cancel`, 'POST', body),
    ]);
    expect(a.order).toEqual(b.order);
    expect(a.order.status).toBe('CANCELLED');
    expect((await f.stock()).reservedQuantity).toBe('0.000000');
    const stored = await f.stored(original.id);
    expect(stored).toMatchObject({
      reservation: { status: 'RELEASED' },
      ticket: { status: 'CANCELLED' },
      documents: 0,
      payments: 0,
    });
    const events = stored.events.filter(
      (event) => event.kind === 'ORDER' && event.toStatus === 'CANCELLED',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      reason: body.reason,
      actorUserId: stored.order.updatedByUserId,
    });
    expect(
      (
        await f.a.primary.call(`/orders/${original.id}/cancel`, 'POST', {
          ...body,
          reason: 'Alt motiv',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await f.cook.call(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
          version: stored.ticket!.version,
          status: 'READY',
        })
      ).status,
    ).toBe(409);
    const board = await f.cook.expect(`/kitchen/tickets?locationId=${f.a.location.id}`);
    expect(board.tickets.map((ticket: { id: string }) => ticket.id)).not.toContain(sent.ticket.id);
  }
});

it('preserves local delegation, PIN access and organization DENY for confirmed cancellations', async () => {
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Anulare locală',
      permissions: [{ permission: 'orders.cancel' }, { permission: 'orders.read' }],
    })
  ).role;
  const created = await f.a.primary.expect('/staff', 'POST', {
    login: 'anulare-pin',
    displayName: 'Operator anulare',
    authenticationMethod: 'PIN',
    locationIds: [f.a.location.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
    ],
  });
  fixturePasswords.add(created.pin);
  const login = async () => {
    const actor = new BrowserSession('TENANT');
    await actor.expect('/auth/session');
    await actor.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: created.pin,
    });
    return actor;
  };
  const actor = await login();
  const original = await f.create();
  await f.confirm(original.id);
  expect(
    (
      await actor.call(`/orders/${original.id}/confirm`, 'POST', {
        version: 2,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await actor.expect(`/orders/${original.id}/cancel`, 'POST', {
        version: 2,
        reason: 'Anulare prin PIN delegat',
      })
    ).order.status,
  ).toBe('CANCELLED');
  const otherProduct = (
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
        items: [{ productId: otherProduct.id, quantity: '1' }],
      }),
    )
  ).order;
  await f.a.primary.expect(`/orders/${other.id}/confirm`, 'POST', {
    version: 1,
    requestKey: randomUUID(),
  });
  expect(
    (await actor.call(`/orders/${other.id}/cancel`, 'POST', { version: 2, reason: 'Altă locație' }))
      .status,
  ).toBe(403);
  await f.a.primary.expect(`/staff/${created.user.id}/overrides`, 'POST', {
    permission: 'orders.cancel',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await login();
  const target = await f.create();
  await f.confirm(target.id);
  expect(
    (
      await denied.call(`/orders/${target.id}/cancel`, 'POST', {
        version: 2,
        reason: 'DENY prevalează',
      })
    ).status,
  ).toBe(403);
  expect((await f.current(target.id)).status).toBe('CONFIRMED');
});
