import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { ORDER_NOTIFICATION_CHANNEL, orderNotificationSchema } from '../../../contracts/src';
import type { OrderNotification } from '../../../contracts/src';

export async function watchOrderNotifications(organizationId: string) {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  const messages: OrderNotification[] = [];
  const barriers = new Map<string, () => void>();
  client.on('notification', (message) => {
    if (message.channel !== ORDER_NOTIFICATION_CHANNEL || !message.payload) return;
    const resolve = barriers.get(message.payload);
    if (resolve) {
      barriers.delete(message.payload);
      resolve();
      return;
    }
    try {
      const parsed = orderNotificationSchema.safeParse(JSON.parse(message.payload));
      if (parsed.success && parsed.data.organizationId === organizationId)
        messages.push(parsed.data);
    } catch {
      /* Other test listeners may publish opaque barrier markers. */
    }
  });
  await client.connect();
  await client.query(`LISTEN "${ORDER_NOTIFICATION_CHANNEL}"`);
  return {
    messages,
    // An acknowledged later transaction drains earlier commit notifications without timing guesses.
    barrier: async () => {
      const marker = `barrier:${randomUUID()}`;
      const received = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          barriers.delete(marker);
          reject(new Error('Bariera notificărilor a expirat'));
        }, 5000);
        barriers.set(marker, () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      await client.query('SELECT pg_notify($1,$2)', [ORDER_NOTIFICATION_CHANNEL, marker]);
      await received;
    },
    close: () => client.end(),
  };
}
