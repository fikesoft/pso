import {
  SEALED_JSON_ALGORITHM,
  SEALED_JSON_IV_BYTES,
  SEALED_JSON_TAG_BYTES,
} from '../config/sealed-json.constants';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { config } from '../config';

export function domainHmac(domain: string, value: string) {
  return createHmac('sha256', Buffer.from(config.MFA_ENCRYPTION_KEY, 'hex'))
    .update(JSON.stringify([domain, value]))
    .digest('hex');
}
export function sealJson(domain: string, context: string[], value: unknown) {
  const iv = randomBytes(SEALED_JSON_IV_BYTES);
  const cipher = createCipheriv(
    SEALED_JSON_ALGORITHM,
    Buffer.from(domainHmac(domain, 'key'), 'hex'),
    iv,
  );
  cipher.setAAD(Buffer.from(JSON.stringify([domain, ...context])));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
export function openJson(domain: string, context: string[], value: string): unknown {
  const bytes = Buffer.from(value, 'base64url');
  if (
    bytes.length <= SEALED_JSON_IV_BYTES + SEALED_JSON_TAG_BYTES ||
    bytes.toString('base64url') !== value
  )
    throw new Error('Invalid sealed data');
  const decipher = createDecipheriv(
    SEALED_JSON_ALGORITHM,
    Buffer.from(domainHmac(domain, 'key'), 'hex'),
    bytes.subarray(0, SEALED_JSON_IV_BYTES),
  );
  decipher.setAAD(Buffer.from(JSON.stringify([domain, ...context])));
  decipher.setAuthTag(
    bytes.subarray(SEALED_JSON_IV_BYTES, SEALED_JSON_IV_BYTES + SEALED_JSON_TAG_BYTES),
  );
  return JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(SEALED_JSON_IV_BYTES + SEALED_JSON_TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8'),
  );
}
