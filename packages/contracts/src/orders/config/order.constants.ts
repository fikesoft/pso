export const ORDER_SOURCES = [
  'PHONE',
  'POS',
  'WAITER',
  'WEB',
  'QR',
  'KIOSK',
  'MOBILE_APP',
  'AGGREGATOR',
  'API',
] as const;
export const MANUAL_ORDER_SOURCES = ['POS', 'PHONE', 'WAITER'] as const;
export const SERVICE_TYPES = ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'PICKUP'] as const;
export const ORDER_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'IN_PROGRESS',
  'READY',
  'COMPLETED',
  'CANCELLED',
] as const;
export const KITCHEN_STATUSES = [
  'QUEUED',
  'PREPARING',
  'PARTIALLY_READY',
  'READY',
  'CANCELLED',
] as const;
