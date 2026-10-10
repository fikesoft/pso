import { websiteDeliveryMessages as text } from '@pos/ui/locales';
export const WEBSITE_STATUS_LABELS = {
  AWAITING_ACCEPTANCE: text.pending,
  ACCEPTED: text.accepted,
  REJECTED: text.rejected,
} as const;
export const WEBSITE_KEY_DEFAULT_DAYS = '30';
