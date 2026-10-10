import { createHmac, randomBytes } from 'node:crypto';
import { config } from '../../../shared/config';
import { TOKEN_HASH_ALGORITHM } from '../config/crypto.constants';
import { STAFF_PIN_BYTES, STAFF_PIN_DOMAIN } from '../config/pin.constants';

export function generateStaffPin(): string {
  return randomBytes(STAFF_PIN_BYTES).toString('hex').toUpperCase();
}

export function normalizeStaffPin(pin: string): string {
  return pin.trim().toUpperCase();
}

/** Company-qualified and domain-separated; a database digest cannot be used as a PIN. */
export function staffPinLookup(companySlug: string, pin: string): string {
  return createHmac(TOKEN_HASH_ALGORITHM, config.CSRF_SECRET)
    .update(
      JSON.stringify([STAFF_PIN_DOMAIN, companySlug.trim().toLowerCase(), normalizeStaffPin(pin)]),
    )
    .digest('hex');
}
