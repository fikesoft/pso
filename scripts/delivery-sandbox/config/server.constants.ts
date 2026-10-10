export const sandboxHost = '127.0.0.1';
export const sandboxPort = 3002;
export const posOrigin = 'http://127.0.0.1:4000';
export const storefrontKeyFile = new URL(
  '../../../.local/website-storefront-key.txt',
  import.meta.url,
);
export const syntheticCustomer = { name: 'Client website sintetic', phone: '+37300000000' };
export const syntheticDelivery = {
  address: 'Adresă sintetică pentru test local',
  instructions: 'Comandă demonstrativă creată pe acest calculator.',
};
export const sandboxBodyLimit = 16 * 1024;
export const sandboxImageLimit = 2 * 1024 * 1024;
export const sandboxRateLimit = 30;
export const sandboxRateWindowMs = 60_000;
export const storefrontLiveLimits = {
  clients: 20,
  bufferBytes: 16_384,
  responseBytes: 65_536,
  retryMs: 1_000,
  maxRetryMs: 10_000,
  connectTimeoutMs: 8_000,
  heartbeatMs: 10_000,
} as const;
export const publicErrorCodes = [
  'WEBSITE_NOT_CONFIGURED',
  'POS_UNAVAILABLE',
  'INVALID_API_KEY',
  'WEBSITE_KEY_INVALID',
  'WEBSITE_PRICE_CHANGED',
  'WEBSITE_ORDER_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'PRODUCT_UNAVAILABLE',
  'MENU_SCHEDULE_UNAVAILABLE',
  'MODIFIER_CONFIGURATION_STALE',
];
export const sandboxAssets = {
  '/': ['../public/index.html', 'text/html; charset=utf-8'],
  '/client.mjs': ['../public/client.mjs', 'text/javascript; charset=utf-8'],
  '/config/client.constants.mjs': [
    '../public/config/client.constants.mjs',
    'text/javascript; charset=utf-8',
  ],
  '/model/purchase.mjs': ['../public/model/purchase.mjs', 'text/javascript; charset=utf-8'],
  '/model/modifiers.mjs': ['../public/model/modifiers.mjs', 'text/javascript; charset=utf-8'],
  '/model/product-information.mjs': [
    '../public/model/product-information.mjs',
    'text/javascript; charset=utf-8',
  ],
  '/model/product-card.mjs': ['../public/model/product-card.mjs', 'text/javascript; charset=utf-8'],
  '/model/menu-availability.mjs': [
    '../public/model/menu-availability.mjs',
    'text/javascript; charset=utf-8',
  ],
} as const;
