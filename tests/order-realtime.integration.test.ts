import { completePacking } from './api/complete-packing';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { attachTenantRealtime } from '../apps/api/src/features/realtime';
import { prepareOrderSearch } from './api/order-search-setup';
import type { OrderSearchFixture } from './api/order-search.types';
import { closeOperations } from './api/operations-setup';
import { orderLive, notifyOrder } from './api/order-realtime-setup';
import { verifyOrderRealtimeAmounts } from './api/order-realtime-access.cases';
import { liveClient } from './api/support/realtime-client';
import { db, noSecrets, servers } from './api/support/harness';

let f: OrderSearchFixture;
let gateway: ReturnType<typeof attachTenantRealtime>;
beforeAll(async () => {
  f = await prepareOrderSearch();
  gateway = attachTenantRealtime(servers[0]!);
  await gateway.ready;
});
afterAll(async () => {
  await gateway?.close();
  if (f) await closeOperations(f.owner.id);
});

it('emits only minimal order identities and committed lifecycle versions without financial or customer payloads', async () => {
  const client = await orderLive(f.a.primary, f.a.location.id);
  try {
    const order = await f.create({
      customer: { name: 'Client realtime secret', phone: '060112233' },
      notes: 'Observație realtime privată',
    });
    const first = await client.next('order.created');
    expect(first).toEqual({
      type: 'order.created',
      topic: 'orders',
      locationId: f.a.location.id,
      orderId: order.id,
      orderVersion: 1,
      eventId: expect.any(String),
    });
    const edit = await f.a.primary.expect(`/orders/${order.id}`, 'PATCH', {
      version: 1,
      serviceType: 'PICKUP',
      items: [{ id: order.items[0].id, productId: f.searchProduct.id, quantity: '2' }],
    });
    expect(await client.next('order.updated')).toMatchObject({
      orderId: order.id,
      orderVersion: 2,
    });
    const sent = await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
      version: edit.order.version,
      requestKey: randomUUID(),
    });
    expect(await client.next('order.updated')).toMatchObject({
      orderId: order.id,
      orderVersion: sent.order.version,
    });
    await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
      version: 1,
      status: 'PREPARING',
    });
    expect(await client.next('order.updated')).toMatchObject({
      orderId: order.id,
      orderVersion: 4,
    });
    await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
      version: 2,
      status: 'READY',
    });
    expect(await client.next('order.updated')).toMatchObject({
      orderId: order.id,
      orderVersion: 5,
    });
    expect(client.messages.some((event) => event.type === 'order.ready')).toBe(false);
    await completePacking(f.a.primary, order.id);
    expect(await client.next('order.ready')).toMatchObject({ orderId: order.id, orderVersion: 6 });
    await f.a.primary.expect(`/orders/${order.id}/cancel`, 'POST', {
      version: 6,
      reason: 'Anulare realtime',
      requestKey: randomUUID(),
    });
    expect(await client.next('order.cancelled')).toMatchObject({
      orderId: order.id,
      orderVersion: 7,
    });
    noSecrets(first);
    expect(JSON.stringify(first)).not.toMatch(
      /Client realtime|060112233|Observație|amount|total|actor|customer|notes/,
    );
  } finally {
    client.socket.terminate();
  }
});

it('rolls back notifications with the transaction and rejects forged ledger references or mismatched scopes', async () => {
  const client = await orderLive(f.a.primary, f.a.location.id);
  try {
    const order = await f.create();
    const event = await client.next('order.created');
    expect(event && 'eventId' in event).toBe(true);
    if (!event || !('eventId' in event)) throw new Error('Missing event');
    await expect(
      db.withTenantTransaction(
        db.runtime,
        { organizationId: f.a.company.organization.id },
        async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: { notes: 'Rollback realtime', version: { increment: 1 } },
          });
          throw new Error('Synthetic order rollback');
        },
      ),
    ).rejects.toThrow('Synthetic order rollback');
    await notifyOrder({
      eventId: randomUUID(),
      organizationId: f.a.company.organization.id,
      locationId: f.a.location.id,
    });
    await notifyOrder({
      eventId: event.eventId,
      organizationId: f.b.company.organization.id,
      locationId: f.a.location.id,
    });
    await notifyOrder({
      eventId: event.eventId,
      organizationId: f.a.company.organization.id,
      locationId: f.otherLocation.id,
    });
    const foreign = await orderLive(f.b.primary, f.b.location.id);
    try {
      const product = (
        await f.b.primary.expect('/catalog/products', 'POST', {
          locationId: f.b.location.id,
          name: 'Produs izolat',
          sku: randomUUID(),
          price: '1',
        })
      ).product;
      await f.b.primary.expect('/orders', 'POST', {
        locationId: f.b.location.id,
        serviceType: 'PICKUP',
        requestKey: randomUUID(),
        items: [{ productId: product.id, quantity: '1' }],
      });
      const foreignEvent = await foreign.next('order.created');
      if (!foreignEvent || !('eventId' in foreignEvent)) throw new Error('Missing foreign event');
      await notifyOrder({
        eventId: foreignEvent.eventId,
        organizationId: f.a.company.organization.id,
        locationId: f.a.location.id,
      });
    } finally {
      foreign.socket.terminate();
    }
    const barrier = await f.create();
    expect(await client.next('order.created')).toMatchObject({
      orderId: barrier.id,
      orderVersion: 1,
    });
    expect(client.messages.filter((message) => message.type.startsWith('order.'))).toEqual([]);
    expect((await f.a.primary.expect(`/orders/${order.id}`)).order.version).toBe(1);
  } finally {
    client.socket.terminate();
  }
});

it('separates orders from catalog topics and prevents cross-location or cross-tenant subscription', async () => {
  const reader = await f.loginSearch();
  const orders = await orderLive(reader, f.a.location.id);
  const foreign = await orderLive(f.b.primary, f.b.location.id);
  const catalog = liveClient(f.a.primary);
  try {
    await catalog.next('ready');
    catalog.subscribe(f.a.location.id);
    await catalog.next('subscribed');
    const created = await f.create();
    expect(await orders.next('order.created')).toMatchObject({ orderId: created.id });
    expect(foreign.messages).toEqual([]);
    expect(catalog.messages).toEqual([]);
    for (const [actor, topic, locationId] of [
      [reader, 'orders', f.otherLocation.id],
      [reader, 'catalog', f.a.location.id],
      [f.b.primary, 'orders', f.a.location.id],
      [await f.loginSearch(f.hidden), 'orders', f.a.location.id],
    ] as const) {
      const denied = liveClient(actor);
      try {
        await denied.next('ready');
        denied.socket.send(JSON.stringify({ type: 'subscribe', topic, locationId }));
        expect(await denied.closed()).toBe(1008);
      } finally {
        denied.socket.terminate();
      }
    }
  } finally {
    orders.socket.terminate();
    foreign.socket.terminate();
    catalog.socket.terminate();
  }
});

it('authorizes both event snapshot and current amount, including delayed genuine ledger notifications', async () => {
  await verifyOrderRealtimeAmounts(f);
});

it('does not replay missed order events on reconnect and reauthorizes revocation before delivery', async () => {
  const actor = await f.loginSearch();
  const client = await orderLive(actor, f.a.location.id);
  client.socket.close();
  await client.closed();
  const missed = await f.create();
  const reconnected = await orderLive(actor, f.a.location.id);
  try {
    const next = await f.create();
    expect(await reconnected.next('order.created')).toMatchObject({ orderId: next.id });
    expect(
      reconnected.messages.some((event) => 'orderId' in event && event.orderId === missed.id),
    ).toBe(false);
    expect((await actor.expect(`/orders/${missed.id}`)).order.id).toBe(missed.id);
    await f.a.primary.expect(`/staff/${f.reader.user.id}/overrides`, 'POST', {
      permission: 'orders.read',
      effect: 'DENY',
      scopeType: 'ORGANIZATION',
    });
    await f.create();
    expect(await reconnected.closed()).toBe(1008);
    expect(reconnected.messages.filter((event) => event.type.startsWith('order.'))).toEqual([]);
    const denied = liveClient(await f.loginSearch());
    try {
      await denied.next('ready');
      denied.socket.send(
        JSON.stringify({ type: 'subscribe', topic: 'orders', locationId: f.a.location.id }),
      );
      expect(await denied.closed()).toBe(1008);
    } finally {
      denied.socket.terminate();
    }
  } finally {
    reconnected.socket.terminate();
  }
});
