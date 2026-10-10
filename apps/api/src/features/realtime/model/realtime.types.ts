import type { WebSocket } from 'ws';
import type { OrderNotification, RealtimeSubscription } from '@pos/contracts';
import type { TenantActorReference } from '../../../shared/lib/http';

export interface LiveConnection {
  socket: WebSocket;
  actor: TenantActorReference;
  subscription?: RealtimeSubscription;
  generation: number;
  pendingOrders: Map<string, OrderNotification>;
  ordersResyncPending: boolean;
  lastOrdersResync: number;
  busy: boolean;
  dirty: boolean;
  alive: boolean;
  checkingAccess: boolean;
  messageCount: number;
  windowStart: number;
  timer?: ReturnType<typeof setTimeout>;
}
