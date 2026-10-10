import type { OrderRepeatIssueCode } from '@pos/contracts';
export const REPEAT_PRODUCT_BLOCKERS: readonly OrderRepeatIssueCode[] = [
  'PRODUCT_UNAVAILABLE',
  'LOCATION_UNCONFIGURED',
  'PRODUCT_DISABLED',
  'OUTSIDE_SCHEDULE',
];
