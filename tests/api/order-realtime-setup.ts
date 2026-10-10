import type { BrowserSession } from './support/harness';
import { db } from './support/harness';
import { liveClient } from './support/realtime-client';
import type { OrderRealtimeNotification } from './order-realtime.types';

export async function orderLive(session: BrowserSession, locationId: string) {
  const client = liveClient(session);
  await client.next('ready');
  client.socket.send(JSON.stringify({ type: 'subscribe', topic: 'orders', locationId }));
  await client.next('subscribed');
  await client.next('resync');
  return client;
}

export async function notifyOrder(notification: OrderRealtimeNotification) {
  await db.withTenantTransaction(
    db.runtime,
    { organizationId: notification.organizationId },
    async (tx) => {
      await tx.$executeRaw`SELECT pg_notify('pos_order_changed', ${JSON.stringify(notification)})`;
    },
  );
}
