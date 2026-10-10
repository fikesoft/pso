import { listenForDatabaseNotifications } from '@pos/db';
import { config } from '../config';
import type { NotificationChannel, NotificationObserver } from './notification-bus.types';

const channels = new Map<string, NotificationChannel>();
export function subscribeDatabaseChannel(channel: string, observer: NotificationObserver) {
  if (!config.DATABASE_URL) throw new Error('Conexiunea PostgreSQL lipsește');
  let state = channels.get(channel);
  if (!state) {
    const entry: NotificationChannel = { observers: new Set(), ready: false, stop: async () => {} };
    entry.stop = listenForDatabaseNotifications({
      connectionString: config.DATABASE_URL,
      channel,
      onMessage: (payload) => {
        for (const client of entry.observers) client.onMessage(payload);
      },
      onReady: () => {
        entry.ready = true;
        for (const client of entry.observers) client.onReady();
      },
      onDisconnect: () => {
        entry.ready = false;
        for (const client of entry.observers) client.onDisconnect();
      },
    });
    channels.set(channel, entry);
    state = entry;
  }
  const entry = state;
  entry.observers.add(observer);
  if (entry.ready)
    queueMicrotask(() => {
      if (entry.observers.has(observer)) observer.onReady();
    });
  return async () => {
    entry.observers.delete(observer);
    if (!entry.observers.size && channels.get(channel) === entry) {
      channels.delete(channel);
      await entry.stop();
    }
  };
}
