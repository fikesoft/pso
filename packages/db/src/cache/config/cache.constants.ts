export const CACHE_LIMITS = {
  namespacePattern: /^[a-z][a-z0-9_.]{0,99}$/,
  keyLength: 200,
  maxBytes: 65_536,
  maxTtlSeconds: 86_400,
  pruneBatchSize: 1_000,
} as const;
