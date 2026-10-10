import { completePacking } from './api/complete-packing';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import type { OrderTimelineResponse } from '../packages/contracts/src';
import { prepareOrderLifecycle } from './api/order-lifecycle-setup';
import type { OrderLifecycleFixture } from './api/order-lifecycle.types';
import { closeOperations } from './api/operations-setup';
import { noSecrets } from './api/support/harness';
import { verifyTimelinePagination, verifyTimelineAccess } from './api/timeline-security.cases';

let f: OrderLifecycleFixture;
beforeAll(async () => {
  f = await prepareOrderLifecycle();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('merges real order, kitchen and financial actions without duplicated replay or private metadata', async () => {
  const created = await f.worker.expect('/orders', 'POST', f.draft());
  const order = created.order;
  const path = `/orders/${order.id}`;
  expect((await f.manager.call(`${path}/timeline`)).status).toBe(403);
  await f.worker.expect(path, 'PATCH', {
    version: 1,
    serviceType: 'PICKUP',
    notes: 'Private order note omitted from timeline',
    items: [{ id: order.items[0].id, productId: f.secondProduct.id, quantity: '3' }],
  });
  await f.confirm(order.id);
  const sent = await f.send(order.id);
  await f.prepare(sent.ticket.id, 1, 'PREPARING');
  await f.prepare(sent.ticket.id, 2, 'PARTIALLY_READY');
  await f.prepare(sent.ticket.id, 3, 'READY');
  const ready = await completePacking(f.a.primary, order.id);
  await f.a.primary.expect(`${path}/complete`, 'POST', {
    version: ready.version,
    requestKey: randomUUID(),
  });
  const completed = await f.current(order.id);
  const paymentBody = {
    version: completed.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: completed.total }],
  };
  const paid = await f.a.primary.expect(`${path}/payments`, 'POST', paymentBody);
  await f.a.primary.expect(`${path}/payments`, 'POST', paymentBody);
  const ledger = await f.a.primary.expect(`${path}/payments`);
  const refundBody = {
    version: paid.order.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    reason: 'Retur sintetic în cronologie',
    refunds: [{ paymentId: ledger.payments[0].id, amount: '1.25' }],
  };
  await f.a.primary.expect(`${path}/refunds`, 'POST', refundBody);
  await f.a.primary.expect(`${path}/refunds`, 'POST', refundBody);
  const response = await f.worker.call(`${path}/timeline`);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const timeline = response.data as OrderTimelineResponse;
  noSecrets(timeline);
  expect(timeline.nextCursor).toBeNull();
  expect(new Set(timeline.events.map((event) => event.id)).size).toBe(timeline.events.length);
  const chronological = [...timeline.events].reverse();
  expect(chronological.filter((e) => e.kind === 'ORDER').map((e) => e.toStatus)).toEqual([
    'DRAFT',
    'DRAFT',
    'CONFIRMED',
    'IN_PROGRESS',
    'READY',
    'COMPLETED',
  ]);
  expect(chronological.filter((e) => e.kind === 'KITCHEN').map((e) => e.toStatus)).toEqual([
    'QUEUED',
    'PREPARING',
    'PARTIALLY_READY',
    'READY',
  ]);
  expect(chronological.filter((e) => e.kind === 'PACKING').map((e) => e.toStatus)).toEqual([
    'PACKING',
    'READY',
  ]);
  expect(chronological[0]).toMatchObject({
    action: 'ORDER_CREATED',
    actorDisplayName: 'Chelner',
    actorNameSource: 'SNAPSHOT',
    locationId: f.a.location.id,
    orderVersion: 1,
  });
  const edited = chronological.find((event) => event.action === 'DRAFT_UPDATED');
  expect(edited).toMatchObject({ actorDisplayName: 'Chelner', orderVersion: 2 });
  const collected = timeline.events.filter((event) => event.action === 'PAYMENT_COLLECTED');
  expect(collected).toHaveLength(1);
  expect(collected[0]).toMatchObject({
    kind: 'PAYMENT',
    actorNameSource: 'SNAPSHOT',
    metadata: { amount: completed.total, currency: 'MDL', method: 'CARD' },
  });
  const refunded = timeline.events.filter((event) => event.action === 'PAYMENT_REFUNDED');
  expect(refunded).toHaveLength(1);
  expect(refunded[0]).toMatchObject({
    reason: refundBody.reason,
    metadata: { amount: '1.25', currency: 'MDL', method: 'CARD' },
  });
  for (const event of timeline.events) {
    expect(event.actorUserId).toBeTruthy();
    expect(event.actorDisplayName).toBeTruthy();
    expect(event.locationId).toBe(f.a.location.id);
    expect(Date.parse(event.createdAt)).not.toBeNaN();
    for (const key of Object.keys(event.metadata))
      expect([
        'amount',
        'currency',
        'method',
        'courierUserId',
        'courierName',
        'checkoutMode',
      ]).toContain(key);
  }
  expect(JSON.stringify(timeline)).not.toMatch(
    /Private order note|requestKey|requestHash|csrf|receivedAmount/,
  );
  const actor = (await f.a.primary.expect('/staff')).users.find(
    (user: { id: string }) => user.id === chronological[0]!.actorUserId,
  );
  await f.a.primary.expect(`/staff/${actor.id}`, 'PATCH', {
    version: actor.version,
    displayName: 'Chelner redenumit',
  });
  const afterRename = await f.a.primary.expect(`${path}/timeline`);
  expect(
    afterRename.events.find((event: { id: string }) => event.id === chronological[0]!.id),
  ).toEqual(chronological[0]);
});

it('includes delivery failure, recovery and cancellation reasons on one order', async () => {
  const order = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        serviceType: 'DELIVERY',
        tableLabel: undefined,
      }),
    )
  ).order;
  await f.confirm(order.id);
  for (const [status, reason] of [
    ['FAILED', 'Client indisponibil'],
    ['WAITING_COURIER', 'Clientul a revenit'],
  ]) {
    await f.a.primary.expect(`/orders/${order.id}/delivery`, 'POST', {
      version: (await f.current(order.id)).version,
      requestKey: randomUUID(),
      status,
      reason,
    });
  }
  await f.a.primary.expect(`/orders/${order.id}/cancel`, 'POST', {
    version: (await f.current(order.id)).version,
    requestKey: randomUUID(),
    reason: 'Clientul renunță',
  });
  const timeline: OrderTimelineResponse = await f.a.primary.expect(`/orders/${order.id}/timeline`);
  expect(timeline.events[0]).toMatchObject({ toStatus: 'CANCELLED', reason: 'Clientul renunță' });
  expect(timeline.events.filter((event) => event.kind === 'DELIVERY')).toMatchObject([
    {
      action: 'DELIVERY_UPDATED',
      fromStatus: 'FAILED',
      toStatus: 'WAITING_COURIER',
      reason: 'Clientul a revenit',
    },
    {
      action: 'DELIVERY_UPDATED',
      fromStatus: 'WAITING_COURIER',
      toStatus: 'FAILED',
      reason: 'Client indisponibil',
    },
  ]);
});

it('labels DEMO checkout explicitly without inventing a payment', async () => {
  const order = await f.create();
  const sent = await f.send(order.id);
  await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
    version: 1,
    status: 'PREPARING',
  });
  await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
    version: 2,
    status: 'READY',
  });
  await completePacking(f.a.primary, order.id);
  await f.a.primary.expect(`/orders/${order.id}/checkout/demo`, 'POST', {
    version: (await f.current(order.id)).version,
    requestKey: randomUUID(),
  });
  const timeline: OrderTimelineResponse = await f.a.primary.expect(`/orders/${order.id}/timeline`);
  expect(timeline.events.filter((event) => event.action === 'DEMO_CHECKOUT')).toHaveLength(1);
  expect(timeline.events.some((event) => event.action === 'PAYMENT_COLLECTED')).toBe(false);
  expect(
    timeline.events.find((event) => event.action === 'DEMO_CHECKOUT')?.metadata.checkoutMode,
  ).toBe('DEMO');
});

it('includes legacy manual checkout payment exactly once with its immutable cashier snapshot', async () => {
  const order = await f.create();
  const sent = await f.send(order.id);
  await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
    version: 1,
    status: 'PREPARING',
  });
  await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
    version: 2,
    status: 'READY',
  });
  await completePacking(f.a.primary, order.id);
  const body = {
    version: (await f.current(order.id)).version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
  };
  await f.a.primary.expect(`/orders/${order.id}/checkout/manual`, 'POST', body);
  await f.a.primary.expect(`/orders/${order.id}/checkout/manual`, 'POST', body);
  const timeline: OrderTimelineResponse = await f.a.primary.expect(`/orders/${order.id}/timeline`);
  const payments = timeline.events.filter((event) => event.action === 'PAYMENT_COLLECTED');
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({
    actorDisplayName: 'Administrator sintetic',
    actorNameSource: 'SNAPSHOT',
    metadata: { amount: order.total, currency: 'MDL', method: 'CARD' },
  });
  expect(
    timeline.events.filter((event) => event.kind === 'ORDER' && event.toStatus === 'COMPLETED'),
  ).toHaveLength(1);
  noSecrets(timeline);
});

it('paginates stably across concurrent appends and rejects foreign or modified cursors', async () => {
  await verifyTimelinePagination(f);
});

it('uses current orders.read with tenant, location and DENY boundaries', async () => {
  await verifyTimelineAccess(f);
});
