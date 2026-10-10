import { createHmac } from 'node:crypto';
import { config } from '../../../shared/config';
import { bootstrapDb, platformDb } from '../../../shared/db';
import { assert } from '../../../shared/lib/http';
import { MINUTE_MS } from '../../../shared/lib/time';
import { DEFAULT_RATE_LIMIT, RATE_LIMIT_MESSAGE } from '../config/session.constants';
import type { PrincipalKind } from './session.types';

/** The database sees only a keyed digest, never a login, slug, credential, or IP. */
export async function rateLimit(
  key: string,
  max = DEFAULT_RATE_LIMIT,
  windowMs = MINUTE_MS,
  kind: PrincipalKind = 'TENANT',
): Promise<void> {
  const digest = createHmac('sha256', config.CSRF_SECRET)
    .update('auth-rate-limit:v1\0')
    .update(key)
    .digest('hex');
  const client = kind === 'PLATFORM' ? platformDb : bootstrapDb;
  const rows = await client.$queryRaw<{ allowed: boolean }[]>`
    SELECT pos_auth.consume_auth_rate_limit(${digest}, ${max}, ${windowMs}) AS allowed`;
  assert(rows[0]?.allowed, 429, RATE_LIMIT_MESSAGE);
}
