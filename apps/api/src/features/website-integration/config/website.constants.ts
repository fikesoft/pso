export const WEBSITE_RATE_IP = 300;
export const WEBSITE_RATE_KEY = 120;
export const WEBSITE_AUTH_MESSAGE = 'Cheie de integrare invalidă sau indisponibilă';
export const WEBSITE_LIVE_LIMITS = {
  perKey: 10,
  total: 200,
  heartbeatMs: 10_000,
  debounceMs: 50,
  maxBufferedBytes: 64 * 1_024,
} as const;
