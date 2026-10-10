import { WebSocket } from 'ws';
import type { RealtimeMessage } from '@pos/contracts';
import { HttpError } from '../../../shared/lib/http';
import { REALTIME_LIMITS } from '../config/realtime.constants';
import { authorizeCatalogSubscription } from './catalog-subscription';
import type { LiveConnection } from './realtime.types';

export function sendLive(connection: LiveConnection, message: RealtimeMessage) {
  if (connection.socket.readyState !== WebSocket.OPEN) return;
  if (connection.socket.bufferedAmount > REALTIME_LIMITS.maxBufferedBytes) {
    connection.socket.close(1013, 'Reîncărcare necesară');
    return;
  }
  connection.socket.send(JSON.stringify(message));
}
export function rejectLive(connection: LiveConnection, error: unknown) {
  const denied = error instanceof HttpError && [401, 403].includes(error.status);
  connection.socket.close(
    denied ? 1008 : 1013,
    denied ? 'Acces expirat' : 'Conexiune indisponibilă',
  );
}
export function queueCatalogChange(connection: LiveConnection) {
  if (connection.subscription?.topic !== 'catalog') return;
  connection.dirty = true;
  if (connection.timer || connection.busy) return;
  connection.timer = setTimeout(() => void flush(connection), REALTIME_LIMITS.debounceMs);
  connection.timer.unref();
}
async function flush(connection: LiveConnection) {
  connection.timer = undefined;
  if (
    connection.busy ||
    connection.subscription?.topic !== 'catalog' ||
    connection.socket.readyState !== WebSocket.OPEN
  )
    return;
  const generation = connection.generation;
  const locationId = connection.subscription.locationId;
  connection.busy = true;
  connection.dirty = false;
  try {
    await authorizeCatalogSubscription(connection.actor, connection.subscription.locationId);
    if (
      connection.generation !== generation ||
      connection.subscription?.topic !== 'catalog' ||
      connection.subscription.locationId !== locationId
    )
      return;
    sendLive(connection, {
      type: 'changed',
      locationId: connection.subscription.locationId,
      topic: 'catalog',
    });
  } catch (error) {
    rejectLive(connection, error);
  } finally {
    connection.busy = false;
    if (connection.dirty && connection.socket.readyState === WebSocket.OPEN)
      queueCatalogChange(connection);
  }
}
