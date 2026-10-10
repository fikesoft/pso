import { operationalMessages as text } from '@pos/ui/locales';
export const SERVICE_LABELS = {
  DINE_IN: text.dineIn,
  TAKEAWAY: text.takeaway,
  DELIVERY: text.delivery,
  PICKUP: text.pickup,
} as const;
export const ORDER_SOURCE_LABELS = {
  POS: text.sourcePOS,
  PHONE: text.sourcePhone,
  WAITER: text.sourceWaiter,
  WEB: text.sourceWeb,
  QR: text.sourceQR,
  KIOSK: text.sourceKiosk,
  MOBILE_APP: text.sourceMobile,
  AGGREGATOR: text.sourceAggregator,
  API: text.sourceAPI,
} as const;
export const ORDER_STATUS_LABELS = {
  DRAFT: text.draft,
  CONFIRMED: text.confirmed,
  IN_PROGRESS: text.inProgress,
  READY: text.ready,
  CANCELLED: text.cancelled,
  COMPLETED: text.completed,
} as const;
export const KITCHEN_STATUS_LABELS = {
  QUEUED: text.kitchenNew,
  PREPARING: text.kitchenPreparing,
  PARTIALLY_READY: text.kitchenPartiallyReady,
  READY: text.kitchenReady,
  CANCELLED: text.cancelled,
} as const;
