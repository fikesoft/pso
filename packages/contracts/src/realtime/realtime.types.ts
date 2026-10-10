import type { ORDER_REALTIME_EVENT_TYPES } from './config/realtime.constants';
export interface RealtimeSubscription {
  type: 'subscribe';
  locationId: string;
  topic: 'catalog' | 'orders' | 'kitchen';
}
export interface RealtimeConfigResponse {
  url: string;
}
export type RealtimeMessage =
  | { type: 'ready' }
  | { type: 'subscribed' | 'changed' | 'resync'; locationId: string; topic: 'catalog' }
  | { type: 'subscribed' | 'resync'; locationId: string; topic: 'orders' }
  | { type: 'subscribed' | 'changed' | 'resync'; locationId: string; topic: 'kitchen' }
  | OrderRealtimeMessage;

export interface OrderRealtimeMessage {
  type: (typeof ORDER_REALTIME_EVENT_TYPES)[number];
  topic: 'orders';
  eventId: string;
  locationId: string;
  orderId: string;
  orderVersion: number;
}
export interface OrderNotification {
  eventId: string;
  organizationId: string;
  locationId: string;
}
