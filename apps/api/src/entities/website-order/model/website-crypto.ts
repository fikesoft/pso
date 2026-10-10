import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { websitePrivateDataSchema } from '@pos/contracts';
import type { WebsitePrivateData } from '@pos/contracts';
import { config } from '../../../shared/config';
import {
  WEBSITE_ENCRYPTION_IV_BYTES,
  WEBSITE_ENCRYPTION_TAG_BYTES,
  WEBSITE_PRIVATE_DATA_DOMAIN,
  WEBSITE_TOKEN_PREFIX,
} from '../config/website.constants';
import type { WebsiteDataContext } from './website.types';

export function websiteKeyHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
export function generateWebsiteKey() {
  const id = randomUUID();
  const apiKey = `${WEBSITE_TOKEN_PREFIX}.${id}.${randomBytes(32).toString('base64url')}`;
  return { id, apiKey, secretHash: websiteKeyHash(apiKey) };
}
function encryptionKey() {
  return createHmac('sha256', Buffer.from(config.MFA_ENCRYPTION_KEY, 'hex'))
    .update(WEBSITE_PRIVATE_DATA_DOMAIN)
    .digest();
}
function associatedData(context: WebsiteDataContext) {
  return Buffer.from(
    JSON.stringify([
      WEBSITE_PRIVATE_DATA_DOMAIN,
      context.organizationId,
      context.locationId,
      context.connectionId,
      context.id,
    ]),
  );
}
export function encryptWebsiteData(context: WebsiteDataContext, data: WebsitePrivateData) {
  const iv = randomBytes(WEBSITE_ENCRYPTION_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(associatedData(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function decryptWebsiteData(context: WebsiteDataContext, value: string): WebsitePrivateData {
  const bytes = Buffer.from(value, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    bytes.subarray(0, WEBSITE_ENCRYPTION_IV_BYTES),
  );
  decipher.setAAD(associatedData(context));
  decipher.setAuthTag(
    bytes.subarray(
      WEBSITE_ENCRYPTION_IV_BYTES,
      WEBSITE_ENCRYPTION_IV_BYTES + WEBSITE_ENCRYPTION_TAG_BYTES,
    ),
  );
  const result = Buffer.concat([
    decipher.update(bytes.subarray(WEBSITE_ENCRYPTION_IV_BYTES + WEBSITE_ENCRYPTION_TAG_BYTES)),
    decipher.final(),
  ]);
  return websitePrivateDataSchema.parse(JSON.parse(result.toString('utf8')));
}
