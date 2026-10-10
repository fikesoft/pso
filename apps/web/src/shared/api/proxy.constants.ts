export const tenantApiFallback = 'http://127.0.0.1:4000';
export const tenantProxyTimeoutMs = 15_000;
export const tenantJsonBodyLimit = 128 * 1024;
export const tenantImageBodyLimit = 4 * 1024 * 1024;
export const forwardedTenantHeaders = [
  'cookie',
  'content-type',
  'origin',
  'x-csrf-token',
  'x-request-id',
  'idempotency-key',
];
