import { WebSocket } from 'ws';
import type { BrowserSession } from './harness';
import { bases, origins } from './harness';
import type { RealtimeMessage, RealtimeSubscription } from '../../../packages/contracts/src';

export function liveClient(session?: BrowserSession, origin = origins.TENANT) {
  const socket = new WebSocket(`${bases.TENANT.replace('http:', 'ws:')}/api/tenant/realtime`, {
    origin,
    headers: session
      ? { cookie: [...session.cookies].map(([name, value]) => `${name}=${value}`).join('; ') }
      : {},
  });
  const messages: RealtimeMessage[] = [];
  const waiters = new Set<() => void>();
  let closedCode: number | undefined;
  socket.on('error', () => {});
  socket.on('message', (data) => {
    messages.push(JSON.parse(data.toString()) as RealtimeMessage);
    for (const notify of waiters) notify();
  });
  socket.on('close', (code) => {
    closedCode = code;
    for (const notify of waiters) notify();
  });
  function wait<T>(value: () => T | undefined): Promise<T> {
    return new Promise((resolve, reject) => {
      const notify = () => {
        const result = value();
        if (result !== undefined) {
          clearTimeout(timer);
          waiters.delete(notify);
          resolve(result);
        }
      };
      const timer = setTimeout(() => {
        waiters.delete(notify);
        reject(new Error('Realtime response timeout'));
      }, 3_000);
      waiters.add(notify);
      notify();
    });
  }
  return {
    socket,
    messages,
    next: (type: RealtimeMessage['type']) =>
      wait(() => {
        const index = messages.findIndex((message) => message.type === type);
        return index < 0 ? undefined : messages.splice(index, 1)[0];
      }),
    closed: () => wait(() => closedCode),
    subscribe: (locationId: string, topic: RealtimeSubscription['topic'] = 'catalog') =>
      socket.send(JSON.stringify({ type: 'subscribe', topic, locationId })),
  };
}
