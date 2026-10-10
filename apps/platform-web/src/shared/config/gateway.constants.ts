export const PLATFORM_API_ORIGIN = 'http://127.0.0.1:4001';
export const GATEWAY_TIMEOUT_MS = 15_000;
export const FORWARDED_REQUEST_HEADERS = [
  'cookie',
  'content-type',
  'origin',
  'x-csrf-token',
  'x-request-id',
] as const;
export const BODYLESS_METHODS = ['GET', 'HEAD'] as const;
