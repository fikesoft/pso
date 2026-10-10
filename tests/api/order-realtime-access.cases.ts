import { expect } from 'vitest';
import type { OrderSearchFixture } from './order-search.types';
import { orderLive, notifyOrder } from './order-realtime-setup';

export async function verifyOrderRealtimeAmounts(f: OrderSearchFixture) {
  const reader = await orderLive(await f.loginSearch(), f.a.location.id);
  const owner = await orderLive(f.a.primary, f.a.location.id);
  const change = async (
    order: { id: string; version: number; items: { id: string }[] },
    quantity: string,
  ) =>
    (
      await f.a.primary.expect(`/orders/${order.id}`, 'PATCH', {
        version: order.version,
        serviceType: 'PICKUP',
        items: [{ id: order.items[0]!.id, productId: f.searchProduct.id, quantity }],
      })
    ).order;
  try {
    const high = await f.create({ items: [{ productId: f.searchProduct.id, quantity: '10' }] });
    const oldHighEvent = await owner.next('order.created');
    if (!oldHighEvent || !('eventId' in oldHighEvent)) throw new Error('Missing event');
    await change(high, '1');
    expect(await reader.next('order.updated')).toMatchObject({ orderId: high.id, orderVersion: 2 });
    await notifyOrder({
      eventId: oldHighEvent.eventId,
      organizationId: f.a.company.organization.id,
      locationId: f.a.location.id,
    });
    const barrier = await f.create();
    expect(await reader.next('order.created')).toMatchObject({ orderId: barrier.id });
    expect(reader.messages.filter((message) => message.type.startsWith('order.'))).toEqual([]);
    const low = await f.create();
    const oldLowEvent = await reader.next('order.created');
    if (!oldLowEvent || !('eventId' in oldLowEvent)) throw new Error('Missing event');
    await change(low, '10');
    await notifyOrder({
      eventId: oldLowEvent.eventId,
      organizationId: f.a.company.organization.id,
      locationId: f.a.location.id,
    });
    const secondBarrier = await f.create();
    expect(await reader.next('order.created')).toMatchObject({ orderId: secondBarrier.id });
    expect(reader.messages.filter((message) => message.type.startsWith('order.'))).toEqual([]);
  } finally {
    reader.socket.terminate();
    owner.socket.terminate();
  }
}
