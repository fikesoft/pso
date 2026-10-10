import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderNotification, OrderRealtimeMessage } from '@pos/contracts';
import { flushOrderChanges, queueOrderChange, queueOrderResync } from './order-connection-io';
import { authorizeOrderSubscription, readOrderRealtimeMessage } from './order-subscription';
import { liveConnection } from './connection.fixture';
import { HttpError } from '../../../shared/lib/http';

vi.mock('./order-subscription', () => ({
  authorizeOrderSubscription: vi.fn(),
  readOrderRealtimeMessage: vi.fn(),
}));
vi.mock('./catalog-subscription', () => ({ authorizeCatalogSubscription: vi.fn() }));
const notification: OrderNotification = {
  eventId: 'event',
  organizationId: 'org',
  locationId: 'location',
};
const message: OrderRealtimeMessage = {
  type: 'order.updated',
  topic: 'orders',
  eventId: 'event',
  locationId: 'location',
  orderId: 'order',
  orderVersion: 2,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('livrarea controlată a evenimentelor de comandă', () => {
  it('refuză rezultatul vechii generații după verificarea asincronă', async () => {
    const connection = liveConnection();
    let finish!: (result: OrderRealtimeMessage) => void;
    vi.mocked(readOrderRealtimeMessage).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    connection.pendingOrders.set(notification.eventId, notification);
    const flushing = flushOrderChanges(connection);
    connection.generation++;
    connection.subscription = {
      type: 'subscribe',
      topic: 'orders',
      locationId: 'another-location',
    };
    finish(message);
    await flushing;
    expect(connection.socket.send).not.toHaveBeenCalled();
    expect(connection.socket.close).not.toHaveBeenCalled();
  });
  it('limitează coada și cere reconectare în loc să piardă silențios notificări', () => {
    const connection = liveConnection();
    connection.busy = true;
    for (let index = 0; index < 200; index++)
      queueOrderChange(connection, { ...notification, eventId: String(index) });
    queueOrderChange(connection, { ...notification, eventId: '0' });
    expect(connection.pendingOrders.size).toBe(200);
    expect(connection.socket.close).not.toHaveBeenCalled();
    queueOrderChange(connection, { ...notification, eventId: 'overflow' });
    expect(connection.socket.close).toHaveBeenCalledWith(1013, 'Reîncărcare necesară');
    expect(connection.pendingOrders.size).toBe(200);
  });
  it('nu publică nimic pentru un eveniment ascuns; resincronizarea periodică este independentă', async () => {
    const connection = liveConnection();
    vi.mocked(readOrderRealtimeMessage).mockResolvedValueOnce(null);
    queueOrderChange(connection, notification);
    await vi.runAllTimersAsync();
    expect(connection.socket.send).not.toHaveBeenCalled();
    expect(authorizeOrderSubscription).not.toHaveBeenCalled();
    queueOrderResync(connection);
    await vi.runAllTimersAsync();
    expect(authorizeOrderSubscription).toHaveBeenCalledWith(connection.actor, 'location');
    expect(connection.socket.send).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ type: 'resync', topic: 'orders', locationId: 'location' }),
    );
  });
  it('ignoră alt scope și închide conexiunea când accesul curent a expirat', async () => {
    const connection = liveConnection();
    queueOrderChange(connection, { ...notification, organizationId: 'foreign' });
    queueOrderChange(connection, { ...notification, locationId: 'foreign' });
    expect(connection.pendingOrders.size).toBe(0);
    vi.mocked(readOrderRealtimeMessage).mockRejectedValueOnce(new HttpError(403, 'Revocat'));
    queueOrderChange(connection, notification);
    await vi.runAllTimersAsync();
    expect(connection.socket.close).toHaveBeenCalledWith(1008, 'Acces expirat');
    expect(connection.socket.send).not.toHaveBeenCalled();
  });
});
