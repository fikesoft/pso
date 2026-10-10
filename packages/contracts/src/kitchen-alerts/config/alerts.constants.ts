export const KITCHEN_ALERT_TARGETS = ['DEFAULT', 'STATION', 'CATEGORY', 'PRODUCT'] as const;
export const KITCHEN_ALERT_MAX_SECONDS = 86400;
export const DEFAULT_KITCHEN_ALERT_THRESHOLDS = {
  warningSeconds: 600,
  criticalSeconds: 900,
} as const;
