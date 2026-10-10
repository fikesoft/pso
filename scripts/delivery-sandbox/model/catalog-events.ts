import type { ServerResponse } from 'node:http';
import { storefrontLiveLimits as limits } from '../config/server.constants';
import type { StorefrontConfig } from './storefront.types';

export function createCatalogEventRelay(config: StorefrontConfig) {
  const clients = new Set<ServerResponse>();
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let retryMs: number = limits.retryMs;
  function broadcast() {
    for (const client of clients) {
      if (client.writableLength > limits.responseBytes) client.destroy();
      else client.write('event: changed\ndata: {}\n\n');
    }
  }
  function stop() {
    generation++;
    controller?.abort();
    controller = undefined;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  }
  async function connect() {
    if (!clients.size || controller) return;
    const current = ++generation;
    const abort = new AbortController();
    controller = abort;
    const timeout = setTimeout(() => abort.abort(), limits.connectTimeoutMs);
    timeout.unref();
    try {
      const response = await fetch(`${config.posOrigin}/api/integrations/catalog/events`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        redirect: 'error',
        signal: abort.signal,
      });
      clearTimeout(timeout);
      if (
        !response.ok ||
        !response.body ||
        !response.headers.get('content-type')?.startsWith('text/event-stream')
      ) {
        await response.body?.cancel();
        throw new Error('STREAM_UNAVAILABLE');
      }
      retryMs = limits.retryMs;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (current === generation && clients.size) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > limits.bufferBytes) throw new Error('STREAM_TOO_LARGE');
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (event.split('\n').includes('event: changed')) broadcast();
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch {
      /* The browser receives no credentials or upstream diagnostics. */
    } finally {
      clearTimeout(timeout);
      abort.abort();
      if (current === generation) {
        controller = undefined;
        if (clients.size) {
          timer = setTimeout(() => {
            timer = undefined;
            void connect();
          }, retryMs);
          timer.unref();
          retryMs = Math.min(retryMs * 2, limits.maxRetryMs);
        }
      }
    }
  }
  return {
    add(response: ServerResponse) {
      if (clients.size >= limits.clients) {
        response.writeHead(429, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ code: 'RATE_LIMITED' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      response.flushHeaders();
      response.write('event: changed\ndata: {}\n\n');
      clients.add(response);
      const heartbeat = setInterval(() => {
        if (response.writableLength > limits.responseBytes) response.destroy();
        else response.write(': heartbeat\n\n');
      }, limits.heartbeatMs);
      heartbeat.unref();
      const remove = () => {
        clearInterval(heartbeat);
        clients.delete(response);
        if (!clients.size) stop();
      };
      response.on('close', remove);
      response.on('error', remove);
      if (!timer) void connect();
    },
    close() {
      for (const client of clients) client.end();
      clients.clear();
      stop();
    },
  };
}
