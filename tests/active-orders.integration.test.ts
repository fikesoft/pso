import { completePacking } from './api/complete-packing';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareActiveOrders } from './api/active-orders-setup';
import type { ActiveOrdersFixture } from './api/active-orders.types';
import type { ActiveOrder } from '../packages/contracts/src';
import { closeOperations } from './api/operations-setup';
import { noSecrets } from './api/support/harness';
import {
  verifyActiveAccess,
  verifyActiveCursor,
  verifyActivePredicate,
} from './api/active-orders-pagination.cases';

let f: ActiveOrdersFixture;
beforeAll(async () => {
  f = await prepareActiveOrders();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
const row = async (id: string) =>
  (await f.list()).orders.find((order: ActiveOrder) => order.id === id);

it('separates operational, kitchen and actual payment states through completion and refund', async () => {
  const order = await f.create();
  expect((await row(order.id)).activeReasons).toEqual(['OPERATIONAL']);
  const sent = await f.command(order.id, 'send');
  expect((await row(order.id)).activeReasons).toEqual(['OPERATIONAL', 'PAYMENT_OUTSTANDING']);
  for (const [index, status] of ['PREPARING', 'READY'].entries()) {
    await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
      version: index + 1,
      status,
    });
    expect(await row(order.id)).toMatchObject({
      status: 'IN_PROGRESS',
      kitchenStatus: status,
      packingStatus: 'WAITING',
    });
  }
  await completePacking(f.a.primary, order.id);
  expect(await row(order.id)).toMatchObject({ status: 'READY', packingStatus: 'READY' });
  await f.command(order.id, 'complete');
  expect(await row(order.id)).toMatchObject({
    status: 'COMPLETED',
    kitchenStatus: 'READY',
    paymentStatus: 'UNPAID',
    activeReasons: ['PAYMENT_OUTSTANDING'],
  });
  await f.pay(order.id);
  expect(await row(order.id)).toBeUndefined();
  const ledger = await f.a.primary.expect(`/orders/${order.id}/payments`);
  await f.command(order.id, 'refunds', {
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    reason: 'Verificare independentă',
    refunds: [{ paymentId: ledger.payments[0].id, amount: '1.01' }],
  });
  expect(await row(order.id)).toMatchObject({
    status: 'COMPLETED',
    paymentStatus: 'PARTIALLY_REFUNDED',
    activeReasons: ['FINANCIAL_REVIEW'],
  });
});

it('keeps paid completed delivery active until actual courier delivery, independently of payment', async () => {
  const order = await f.complete({ serviceType: 'DELIVERY' });
  expect((await row(order.id)).activeReasons).toEqual(['PAYMENT_OUTSTANDING', 'DELIVERY_PENDING']);
  await f.pay(order.id);
  expect((await row(order.id)).activeReasons).toEqual(['DELIVERY_PENDING']);
  await f.command(order.id, 'delivery', { status: 'ASSIGNED', courierUserId: f.courier.user.id });
  await f.command(order.id, 'delivery', { status: 'FAILED', reason: 'Client indisponibil' });
  expect(await row(order.id)).toMatchObject({
    deliveryStatus: 'FAILED',
    activeReasons: ['DELIVERY_PENDING'],
  });
  await f.command(order.id, 'delivery', { status: 'WAITING_COURIER', reason: 'Client revenit' });
  await f.command(order.id, 'delivery', { status: 'ASSIGNED', courierUserId: f.courier.user.id });
  for (const status of ['PICKED_UP', 'DELIVERING', 'DELIVERED'])
    await f.command(order.id, 'delivery', { status });
  expect(await row(order.id)).toBeUndefined();
  expect(await f.current(order.id)).toMatchObject({
    status: 'COMPLETED',
    paymentStatus: 'PAID',
    deliveryStatus: 'DELIVERED',
  });
  const unpaid = await f.complete({ serviceType: 'DELIVERY' });
  await f.command(unpaid.id, 'delivery', { status: 'ASSIGNED', courierUserId: f.courier.user.id });
  for (const status of ['PICKED_UP', 'DELIVERING', 'DELIVERED'])
    await f.command(unpaid.id, 'delivery', { status });
  expect((await row(unpaid.id)).activeReasons).toEqual(['PAYMENT_OUTSTANDING']);
});

it('excludes settled cancellation and DEMO without inventing real financial obligations', async () => {
  const cancelled = await f.create();
  await f.command(cancelled.id, 'cancel', { reason: 'Ciornă abandonată' });
  expect(await row(cancelled.id)).toBeUndefined();
  const demo = await f.create();
  const sent = await f.command(demo.id, 'send');
  for (const [index, status] of ['PREPARING', 'READY'].entries())
    await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
      version: index + 1,
      status,
    });
  await completePacking(f.a.primary, demo.id);
  await f.command(demo.id, 'checkout/demo');
  expect((await f.current(demo.id)).checkout.mode).toBe('DEMO');
  expect(await row(demo.id)).toBeUndefined();
});

it('returns authorized contact DTO with no-store and leaves business history unchanged', async () => {
  const order = await f.create({ customer: { name: 'Contact activ privat', phone: '060123987' } });
  const before = await f.effects(order.id);
  const result = await f.a.primary.call(f.path());
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(result.data.timezone).toBe('Europe/Chisinau');
  noSecrets(result.data);
  const listed = result.data.orders.find((entry: ActiveOrder) => entry.id === order.id);
  const { activeReasons, ...dto } = listed;
  expect(activeReasons).toEqual(['OPERATIONAL']);
  expect(dto).toEqual(await f.current(order.id));
  expect(await f.effects(order.id)).toEqual(before);
  for (const query of ['&limit=0', '&limit=51', '&limit=1.1', '&status=DRAFT', '&cursor=broken'])
    expect((await f.a.primary.call(f.path(query))).status).toBe(400);
  expect((await f.a.primary.call('/orders/active')).status).toBe(400);
});

it('enforces tenant, location, amount, create-only and current DENY independently', async () =>
  verifyActiveAccess(f));
it('uses opaque scoped cursors and survives inactive anchors and insertion without duplicates', async () =>
  verifyActiveCursor(f));
it('filters inactive orders before limiting candidates and continues authorized sparse pages', async () =>
  verifyActivePredicate(f));
