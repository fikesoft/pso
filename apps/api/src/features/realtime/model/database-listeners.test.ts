import { describe, expect, it, vi } from 'vitest';
import {
  CATALOG_NOTIFICATION_CHANNEL,
  ORDER_NOTIFICATION_CHANNEL,
  KITCHEN_NOTIFICATION_CHANNEL,
} from '@pos/contracts';
import type { NotificationObserver } from '../../../shared/db/notification-bus.types';
import { startRealtimeListeners } from './database-listeners';
import { liveConnection } from './connection.fixture';

const observers = vi.hoisted(() => new Map<string, NotificationObserver>());
vi.mock('../../../shared/db', () => ({
  subscribeDatabaseChannel: vi.fn((channel: string, observer: NotificationObserver) => {
    observers.set(channel, observer);
    return vi.fn();
  }),
}));
vi.mock('./order-connection-io', () => ({ queueOrderChange: vi.fn() }));
vi.mock('./connection-io', () => ({ queueCatalogChange: vi.fn() }));
vi.mock('./kitchen-connection-io', () => ({ queueKitchenChange: vi.fn() }));

describe('reconectarea sursei PostgreSQL realtime', () => {
  it('așteaptă toate LISTEN și închide numai abonamentele sursei întrerupte', async () => {
    const orders = liveConnection();
    const catalog = liveConnection('catalog');
    const kitchen = liveConnection('kitchen');
    const online = vi.fn();
    const stop = startRealtimeListeners(new Set([orders, catalog, kitchen]), online);
    observers.get(CATALOG_NOTIFICATION_CHANNEL)!.onReady();
    expect(online).toHaveBeenLastCalledWith(false);
    observers.get(ORDER_NOTIFICATION_CHANNEL)!.onReady();
    expect(online).toHaveBeenLastCalledWith(false);
    observers.get(KITCHEN_NOTIFICATION_CHANNEL)!.onReady();
    expect(online).toHaveBeenLastCalledWith(true);
    observers.get(ORDER_NOTIFICATION_CHANNEL)!.onDisconnect();
    expect(online).toHaveBeenLastCalledWith(false);
    expect(orders.socket.close).toHaveBeenCalledWith(1013, 'Reconectare necesară');
    expect(catalog.socket.close).not.toHaveBeenCalled();
    observers.get(ORDER_NOTIFICATION_CHANNEL)!.onReady();
    expect(online).toHaveBeenLastCalledWith(true);
    observers.get(KITCHEN_NOTIFICATION_CHANNEL)!.onDisconnect();
    expect(online).toHaveBeenLastCalledWith(false);
    expect(kitchen.socket.close).toHaveBeenCalledWith(1013, 'Reconectare necesară');
    expect(catalog.socket.close).not.toHaveBeenCalled();
    await stop();
  });
});
