import argon2 from 'argon2';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import * as OTPAuth from 'otpauth';
import { config } from '../../../shared/config';
import {
  ARGON2_OPTIONS,
  ENCRYPTION_ALGORITHM,
  ENCRYPTION_IV_BYTES,
  ENCRYPTION_TAG_BYTES,
  TEMPORARY_PASSWORD_BYTES,
  TOKEN_BYTES,
  TOKEN_HASH_ALGORITHM,
  TOTP_OPTIONS,
  TOTP_SECRET_BYTES,
  TOTP_VALIDATION_WINDOW,
} from '../config/crypto.constants';
export const token = () => randomBytes(TOKEN_BYTES).toString('base64url');
export const hashToken = (value: string) =>
  createHash(TOKEN_HASH_ALGORITHM).update(value).digest('hex');
export const temporaryPassword = () => randomBytes(TEMPORARY_PASSWORD_BYTES).toString('base64url');
export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, ...ARGON2_OPTIONS });
export const verifyPassword = async (hash: string, password: string) => {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
};
export const csrf = (sessionToken: string) =>
  createHmac(TOKEN_HASH_ALGORITHM, config.CSRF_SECRET).update(sessionToken).digest('base64url');
export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function encrypt(secret: string) {
  const iv = randomBytes(ENCRYPTION_IV_BYTES);
  const cipher = createCipheriv(
    ENCRYPTION_ALGORITHM,
    Buffer.from(config.MFA_ENCRYPTION_KEY, 'hex'),
    iv,
  );
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function decrypt(value: string) {
  const data = Buffer.from(value, 'base64');
  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    Buffer.from(config.MFA_ENCRYPTION_KEY, 'hex'),
    data.subarray(0, ENCRYPTION_IV_BYTES),
  );
  decipher.setAuthTag(
    data.subarray(ENCRYPTION_IV_BYTES, ENCRYPTION_IV_BYTES + ENCRYPTION_TAG_BYTES),
  );
  return Buffer.concat([
    decipher.update(data.subarray(ENCRYPTION_IV_BYTES + ENCRYPTION_TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}
export function newTotp(label: string) {
  return new OTPAuth.TOTP({
    ...TOTP_OPTIONS,
    label,
    secret: new OTPAuth.Secret({ size: TOTP_SECRET_BYTES }),
  });
}
export function verifyTotp(secret: string, code: string, lastUsedStep: bigint | null) {
  const now = Date.now();
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    ...TOTP_OPTIONS,
  });
  const delta = totp.validate({ token: code, window: TOTP_VALIDATION_WINDOW, timestamp: now });
  if (delta === null) return null;
  const step = BigInt(Math.floor(now / (TOTP_OPTIONS.period * 1000)) + delta);
  return lastUsedStep !== null && step <= lastUsedStep ? null : step;
}
