import { vi } from 'vitest';
import { WebSocket } from 'ws';
import type { LiveConnection } from './realtime.types';

export function liveConnection(topic: 'orders' | 'catalog' | 'kitchen' = 'orders'): LiveConnection {
  return {
    socket: {
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket,
    actor: {
      user: { id: 'actor', organizationId: 'org' },
      session: { id: 'session', authVersion: 1 },
    },
    subscription: { type: 'subscribe', topic, locationId: 'location' },
    generation: 1,
    pendingOrders: new Map(),
    ordersResyncPending: false,
    lastOrdersResync: 0,
    busy: false,
    dirty: false,
    alive: true,
    checkingAccess: false,
    messageCount: 0,
    windowStart: Date.now(),
  };
}
