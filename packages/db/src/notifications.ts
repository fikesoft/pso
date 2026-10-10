import pg from 'pg';
import { NOTIFICATION_RECONNECT_MS } from './config/notifications.constants';
import type { DatabaseNotificationOptions } from './model/notifications.types';

export function listenForDatabaseNotifications(options: DatabaseNotificationOptions) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(options.channel)) throw new Error('Canal PostgreSQL invalid');
  let stopped = false;
  let client: pg.Client | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function connect() {
    if (stopped) return;
    const current = new pg.Client({
      connectionString: options.connectionString,
      connectionTimeoutMillis: 5_000,
    });
    client = current;
    let disconnected = false;
    const disconnect = () => {
      if (disconnected || stopped) return;
      disconnected = true;
      options.onDisconnect();
      void current.end().catch(() => undefined);
      if (stopped) return;
      timer = setTimeout(() => void connect(), NOTIFICATION_RECONNECT_MS);
      timer.unref();
    };
    current.on('error', disconnect);
    current.on('end', disconnect);
    current.on('notification', (message) => {
      if (!stopped && !disconnected && message.channel === options.channel && message.payload)
        options.onMessage(message.payload);
    });
    try {
      await current.connect();
      await current.query(`LISTEN "${options.channel}"`);
      if (!stopped && !disconnected) options.onReady();
    } catch {
      disconnect();
    }
  }
  void connect();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await client?.end().catch(() => undefined);
  };
}
