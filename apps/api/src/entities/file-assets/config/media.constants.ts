export const MEDIA_INPUT_BYTES = 4 * 1024 * 1024;
export const MEDIA_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MEDIA_BLOB_TIMEOUT_MS = 10_000;
export const MEDIA_INPUT_PIXELS = 16_000_000;
export const MEDIA_DECODE_SECONDS = 5;
export const MEDIA_CONCURRENT_DECODES = 2;
export const MEDIA_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
export const MEDIA_RECONCILE_BATCH = 32;
export const MEDIA_RECONCILE_CURSOR_LIMIT = 8;
export const MEDIA_RECONCILE_CURSOR_IDLE_MS = 10 * 60 * 1000;
export const MEDIA_MAX_DIMENSION = { STAFF_AVATAR: 512, PRODUCT_IMAGE: 1280 } as const;
export const MEDIA_INPUT_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
} as const;
