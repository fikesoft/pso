import {
  CATALOG_NOTIFICATION_CHANNEL,
  ORDER_NOTIFICATION_CHANNEL,
  KITCHEN_NOTIFICATION_CHANNEL,
  kitchenNotificationSchema,
  catalogNotificationSchema,
  orderNotificationSchema,
} from '@pos/contracts';
import { subscribeDatabaseChannel } from '../../../shared/db';
import { queueCatalogChange } from './connection-io';
import { queueOrderChange } from './order-connection-io';
import { queueKitchenChange } from './kitchen-connection-io';
import type { LiveConnection } from './realtime.types';

export function startRealtimeListeners(
  sockets: Set<LiveConnection>,
  onOnline: (online: boolean) => void,
) {
  let catalogReady = false;
  let ordersReady = false;
  let kitchenReady = false;
  function disconnected(topic: 'catalog' | 'orders' | 'kitchen') {
    if (topic === 'catalog') catalogReady = false;
    else if (topic === 'orders') ordersReady = false;
    else kitchenReady = false;
    onOnline(false);
    for (const connection of sockets)
      if (!connection.subscription || connection.subscription.topic === topic)
        connection.socket.close(1013, 'Reconectare necesară');
  }
  const stopCatalog = subscribeDatabaseChannel(CATALOG_NOTIFICATION_CHANNEL, {
    onReady: () => {
      catalogReady = true;
      onOnline(catalogReady && ordersReady && kitchenReady);
    },
    onDisconnect: () => disconnected('catalog'),
    onMessage: (payload) => {
      try {
        const parsed = catalogNotificationSchema.safeParse(JSON.parse(payload));
        if (!parsed.success) return;
        for (const connection of sockets)
          if (
            connection.subscription?.topic === 'catalog' &&
            connection.actor.user.organizationId === parsed.data.organizationId &&
            (!parsed.data.locationId ||
              connection.subscription.locationId === parsed.data.locationId)
          )
            queueCatalogChange(connection);
      } catch {
        /* Untrusted wakeups do not reach clients. */
      }
    },
  });
  const stopOrders = subscribeDatabaseChannel(ORDER_NOTIFICATION_CHANNEL, {
    onReady: () => {
      ordersReady = true;
      onOnline(catalogReady && ordersReady && kitchenReady);
    },
    onDisconnect: () => disconnected('orders'),
    onMessage: (payload) => {
      try {
        const parsed = orderNotificationSchema.safeParse(JSON.parse(payload));
        if (!parsed.success) return;
        for (const connection of sockets) queueOrderChange(connection, parsed.data);
      } catch {
        /* The database event is reloaded before any client disclosure. */
      }
    },
  });
  const stopKitchen = subscribeDatabaseChannel(KITCHEN_NOTIFICATION_CHANNEL, {
    onReady: () => {
      kitchenReady = true;
      onOnline(catalogReady && ordersReady && kitchenReady);
    },
    onDisconnect: () => disconnected('kitchen'),
    onMessage: (payload) => {
      try {
        const parsed = kitchenNotificationSchema.safeParse(JSON.parse(payload));
        if (!parsed.success) return;
        for (const connection of sockets)
          if (
            connection.subscription?.topic === 'kitchen' &&
            connection.actor.user.organizationId === parsed.data.organizationId &&
            connection.subscription.locationId === parsed.data.locationId
          )
            queueKitchenChange(connection);
      } catch {
        /* Wakeups contain no business payload; clients recapture authorized state. */
      }
    },
  });
  return async () => {
    await Promise.all([stopCatalog(), stopOrders(), stopKitchen()]);
  };
}
