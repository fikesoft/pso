import { WebSocket } from 'ws';
import type { OrderNotification } from '@pos/contracts';
import { REALTIME_LIMITS } from '../config/realtime.constants';
import { authorizeOrderSubscription, readOrderRealtimeMessage } from './order-subscription';
import { rejectLive, sendLive } from './connection-io';
import type { LiveConnection } from './realtime.types';

export function scheduleOrders(connection: LiveConnection) {
  if (
    (!connection.pendingOrders.size && !connection.ordersResyncPending) ||
    connection.timer ||
    connection.busy ||
    connection.socket.readyState !== WebSocket.OPEN
  )
    return;
  connection.timer = setTimeout(
    () => void flushOrderChanges(connection),
    REALTIME_LIMITS.debounceMs,
  );
  connection.timer.unref();
}
export function queueOrderChange(connection: LiveConnection, notification: OrderNotification) {
  if (
    connection.subscription?.topic !== 'orders' ||
    connection.subscription.locationId !== notification.locationId ||
    connection.actor.user.organizationId !== notification.organizationId
  )
    return;
  if (
    !connection.pendingOrders.has(notification.eventId) &&
    connection.pendingOrders.size >= REALTIME_LIMITS.maxPendingOrderEvents
  ) {
    connection.socket.close(1013, 'Reîncărcare necesară');
    return;
  }
  connection.pendingOrders.set(notification.eventId, notification);
  scheduleOrders(connection);
}
export function queueOrderResync(connection: LiveConnection) {
  if (connection.subscription?.topic !== 'orders') return;
  connection.ordersResyncPending = true;
  scheduleOrders(connection);
}
export async function flushOrderChanges(connection: LiveConnection) {
  connection.timer = undefined;
  if (
    connection.busy ||
    connection.subscription?.topic !== 'orders' ||
    connection.socket.readyState !== WebSocket.OPEN
  )
    return;
  const generation = connection.generation;
  const locationId = connection.subscription.locationId;
  const stillSubscribed = () =>
    connection.generation === generation &&
    connection.subscription?.topic === 'orders' &&
    connection.subscription.locationId === locationId &&
    connection.socket.readyState === WebSocket.OPEN;
  connection.busy = true;
  try {
    if (connection.ordersResyncPending) {
      connection.ordersResyncPending = false;
      await authorizeOrderSubscription(connection.actor, locationId);
      if (!stillSubscribed()) return;
      connection.lastOrdersResync = Date.now();
      sendLive(connection, { type: 'resync', topic: 'orders', locationId });
    }
    for (let count = 0; count < REALTIME_LIMITS.orderFlushBatch; count++) {
      const entry = connection.pendingOrders.entries().next().value;
      if (!entry) break;
      const [id, notification] = entry;
      connection.pendingOrders.delete(id);
      const message = await readOrderRealtimeMessage(connection.actor, notification);
      if (!stillSubscribed()) return;
      if (message) sendLive(connection, message);
    }
  } catch (error) {
    if (stillSubscribed()) rejectLive(connection, error);
  } finally {
    connection.busy = false;
    if (connection.pendingOrders.size || connection.ordersResyncPending) scheduleOrders(connection);
  }
}
