import { WebSocket } from 'ws';
import { REALTIME_LIMITS } from '../config/realtime.constants';
import { authorizeKitchenSubscription } from './kitchen-subscription';
import { rejectLive, sendLive } from './connection-io';
import type { LiveConnection } from './realtime.types';
export function queueKitchenChange(connection: LiveConnection) {
  if (connection.subscription?.topic !== 'kitchen') return;
  connection.dirty = true;
  if (connection.timer || connection.busy) return;
  connection.timer = setTimeout(() => void flushKitchen(connection), REALTIME_LIMITS.debounceMs);
  connection.timer.unref();
}
async function flushKitchen(connection: LiveConnection) {
  connection.timer = undefined;
  if (
    connection.busy ||
    connection.subscription?.topic !== 'kitchen' ||
    connection.socket.readyState !== WebSocket.OPEN
  )
    return;
  const generation = connection.generation;
  const locationId = connection.subscription.locationId;
  connection.busy = true;
  connection.dirty = false;
  try {
    await authorizeKitchenSubscription(connection.actor, locationId);
    if (
      connection.generation !== generation ||
      connection.subscription?.topic !== 'kitchen' ||
      connection.subscription.locationId !== locationId
    )
      return;
    sendLive(connection, { type: 'changed', topic: 'kitchen', locationId });
    connection.lastOrdersResync = Date.now();
  } catch (error) {
    rejectLive(connection, error);
  } finally {
    connection.busy = false;
    if (connection.dirty && connection.socket.readyState === WebSocket.OPEN)
      queueKitchenChange(connection);
  }
}
