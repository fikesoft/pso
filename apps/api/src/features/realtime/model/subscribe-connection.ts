import type { RawData } from 'ws';
import { realtimeSubscriptionSchema } from '@pos/contracts';
import { REALTIME_LIMITS } from '../config/realtime.constants';
import { authorizeLiveSubscription } from './subscription-authorization';
import { scheduleOrders } from './order-connection-io';
import { queueKitchenChange } from './kitchen-connection-io';
import { queueCatalogChange, rejectLive, sendLive } from './connection-io';
import type { LiveConnection } from './realtime.types';

export async function subscribeConnection(
  connection: LiveConnection,
  data: RawData,
  binary: boolean,
) {
  if (Date.now() - connection.windowStart >= 60_000) {
    connection.windowStart = Date.now();
    connection.messageCount = 0;
  }
  if (binary || connection.busy || ++connection.messageCount > REALTIME_LIMITS.messagesPerMinute) {
    connection.socket.close(1008, 'Cerere nepermisă');
    return;
  }
  connection.busy = true;
  try {
    const parsed = realtimeSubscriptionSchema.safeParse(JSON.parse(data.toString()));
    if (!parsed.success) {
      connection.socket.close(1008, 'Abonament invalid');
      return;
    }
    await authorizeLiveSubscription(connection.actor, parsed.data);
    connection.generation++;
    if (connection.timer) clearTimeout(connection.timer);
    connection.timer = undefined;
    connection.pendingOrders.clear();
    connection.ordersResyncPending = false;
    connection.dirty = false;
    connection.lastOrdersResync = Date.now();
    connection.subscription = parsed.data;
    sendLive(connection, {
      type: 'subscribed',
      locationId: parsed.data.locationId,
      topic: parsed.data.topic,
    });
    if (parsed.data.topic === 'orders')
      sendLive(connection, { type: 'resync', topic: 'orders', locationId: parsed.data.locationId });
    if (parsed.data.topic === 'kitchen')
      sendLive(connection, {
        type: 'resync',
        topic: 'kitchen',
        locationId: parsed.data.locationId,
      });
  } catch (error) {
    if (error instanceof SyntaxError) connection.socket.close(1008, 'Mesaj invalid');
    else rejectLive(connection, error);
  } finally {
    connection.busy = false;
    if (connection.subscription?.topic === 'orders') scheduleOrders(connection);
    else if (connection.subscription?.topic === 'kitchen' && connection.dirty)
      queueKitchenChange(connection);
    else if (connection.dirty) queueCatalogChange(connection);
  }
}
