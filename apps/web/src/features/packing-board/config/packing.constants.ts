import { packingMessages as text } from '@pos/ui/locales';
export const PACKING_FILTERS = [
  { value: 'ACTIVE', label: text.active },
  { value: 'WAITING', label: text.waiting },
  { value: 'PACKING', label: text.packing },
  { value: 'READY', label: text.ready },
] as const;
export const PACKING_LABELS = {
  WAITING: text.waiting,
  PACKING: text.packing,
  READY: text.ready,
  CANCELLED: text.cancelled,
} as const;
export const PACKING_REFRESH_MS = 5000;
