export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DATABASE_OPTIONS = {
  maxConnections: 10,
  vercelMaxConnections: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  transactionMaxWaitMillis: 5_000,
  transactionTimeoutMillis: 15_000,
  runtimeRole: 'pos_runtime',
} as const;
