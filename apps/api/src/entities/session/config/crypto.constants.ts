export const TOKEN_BYTES = 32;
export const TEMPORARY_PASSWORD_BYTES = 18;
export const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const TOKEN_HASH_ALGORITHM = 'sha256';
export const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
export const ENCRYPTION_IV_BYTES = 12;
export const ENCRYPTION_TAG_BYTES = 16;
export const TOTP_OPTIONS = {
  issuer: 'POS Local',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
} as const;
export const TOTP_SECRET_BYTES = 20;
export const TOTP_VALIDATION_WINDOW = 1;
