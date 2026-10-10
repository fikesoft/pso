export const REALTIME_PATH = '/api/tenant/realtime';
export const REALTIME_CATALOG_TOPIC = 'catalog';
export const REALTIME_DEV_PORT = '4000';
export const CATALOG_NOTIFICATION_CHANNEL = 'pos_catalog_changed';
export const REALTIME_ORDERS_TOPIC = 'orders';
export const ORDER_NOTIFICATION_CHANNEL = 'pos_order_changed';
export const KITCHEN_NOTIFICATION_CHANNEL = 'pos_kitchen_changed';
export const ORDER_REALTIME_EVENT_TYPES = [
  'order.created',
  'order.updated',
  'order.ready',
  'order.cancelled',
] as const;
