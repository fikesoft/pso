import { parseCookie } from 'cookie';
import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { REALTIME_PATH } from '@pos/contracts';
import { cookieName, loadAuthToken, rateLimit } from '../../../entities/session';
import { config } from '../../../shared/config';
import { assert, HttpError } from '../../../shared/lib/http';
import { REALTIME_LIMITS } from '../config/realtime.constants';
import { authorizeCatalogSubscription } from '../model/catalog-subscription';
import { rejectLive, sendLive } from '../model/connection-io';
import { startRealtimeListeners } from '../model/database-listeners';
import { authorizeLiveSubscription } from '../model/subscription-authorization';
import { queueOrderResync } from '../model/order-connection-io';
import { queueKitchenChange } from '../model/kitchen-connection-io';
import { subscribeConnection } from '../model/subscribe-connection';
import type { LiveConnection } from '../model/realtime.types';

export function attachTenantRealtime(server: Server) {
  assert(config.DATABASE_URL, 500, 'Conexiunea PostgreSQL lipsește');
  const sockets = new Set<LiveConnection>();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: REALTIME_LIMITS.maxMessageBytes,
    perMessageDeflate: false,
  });
  let online = false;
  let pending = 0;
  let stopped = false;
  let resolveReady = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const stopListening = startRealtimeListeners(sockets, (readyNow) => {
    online = readyNow;
    if (readyNow) resolveReady();
  });
  function connected(socket: WebSocket, actor: LiveConnection['actor']) {
    const connection: LiveConnection = {
      socket,
      actor,
      alive: true,
      generation: 0,
      pendingOrders: new Map(),
      ordersResyncPending: false,
      lastOrdersResync: Date.now(),
      checkingAccess: false,
      busy: false,
      dirty: false,
      messageCount: 0,
      windowStart: Date.now(),
    };
    sockets.add(connection);
    socket.on('error', () => socket.terminate());
    socket.on('pong', () => {
      connection.alive = true;
    });
    socket.on('message', (data, binary) => void subscribeConnection(connection, data, binary));
    socket.on('close', () => {
      sockets.delete(connection);
      if (connection.timer) clearTimeout(connection.timer);
    });
    sendLive(connection, { type: 'ready' });
  }
  async function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    // Register an error handler before asynchronous authentication touches the socket.
    const failed = () => socket.destroy();
    socket.on('error', failed);
    const timeout = setTimeout(() => socket.destroy(), REALTIME_LIMITS.handshakeTimeoutMs);
    timeout.unref();
    if (pending >= REALTIME_LIMITS.maxPendingHandshakes) {
      socket.destroy();
      clearTimeout(timeout);
      return;
    }
    pending++;
    try {
      assert(
        !stopped && online && sockets.size < REALTIME_LIMITS.maxConnections,
        503,
        'Conexiune indisponibilă',
      );
      assert(req.url === REALTIME_PATH && req.method === 'GET', 404, 'Ruta nu există');
      assert(req.headers.origin === config.TENANT_ORIGIN, 403, 'Origine nepermisă');
      await rateLimit(
        `realtime:${req.socket.remoteAddress ?? 'unknown'}`,
        REALTIME_LIMITS.handshakesPerMinute,
      );
      const auth = await loadAuthToken(
        parseCookie(req.headers.cookie ?? '')[cookieName('TENANT')],
        'TENANT',
        false,
      );
      assert(
        auth?.kind === 'TENANT' && auth.user.organizationId && auth.stage === 'ready',
        401,
        'Autentificare necesară',
      );
      const actor = {
        user: { id: auth.user.id, organizationId: auth.user.organizationId },
        session: { id: auth.session.id, authVersion: auth.session.authVersion },
      };
      await authorizeCatalogSubscription(actor);
      assert(
        [...sockets].filter((connection) => connection.actor.session.id === actor.session.id)
          .length < REALTIME_LIMITS.maxSessionConnections,
        429,
        'Prea multe conexiuni',
      );
      assert(sockets.size < REALTIME_LIMITS.maxConnections, 503, 'Prea multe conexiuni');
      if (socket.destroyed || stopped || !online) {
        socket.destroy();
        return;
      }
      socket.removeListener('error', failed);
      wss.handleUpgrade(req, socket, head, (ws) => connected(ws, actor));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      if (!socket.destroyed)
        socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    } finally {
      pending--;
      clearTimeout(timeout);
    }
  }
  const handleUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    void upgrade(req, socket, head);
  };
  server.on('upgrade', handleUpgrade);
  const heartbeat = setInterval(() => {
    for (const connection of sockets) {
      if (connection.socket.readyState !== WebSocket.OPEN) continue;
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
      if (Date.now() - connection.lastOrdersResync >= REALTIME_LIMITS.orderResyncIntervalMs)
        if (connection.subscription?.topic === 'kitchen') queueKitchenChange(connection);
        else queueOrderResync(connection);
      if (!connection.checkingAccess) {
        connection.checkingAccess = true;
        void authorizeLiveSubscription(connection.actor, connection.subscription)
          .catch((error: unknown) => rejectLive(connection, error))
          .finally(() => {
            connection.checkingAccess = false;
          });
      }
    }
  }, REALTIME_LIMITS.checkIntervalMs);
  heartbeat.unref();
  return {
    ready,
    close: async () => {
      stopped = true;
      server.removeListener('upgrade', handleUpgrade);
      clearInterval(heartbeat);
      for (const connection of sockets) {
        if (connection.timer) clearTimeout(connection.timer);
        connection.socket.terminate();
      }
      wss.close();
      await stopListening();
    },
  };
}
