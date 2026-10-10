import { idSchema } from '@pos/contracts';
import type { Request, Response } from 'express';
import { rateLimit } from '../../../entities/session';
import { websiteKeyHash, WEBSITE_TOKEN_PATTERN } from '../../../entities/website-order';
import { bootstrapDb, runtime, withTenantTransaction } from '../../../shared/db';
import { assert } from '../../../shared/lib/http';
import {
  WEBSITE_AUTH_MESSAGE,
  WEBSITE_RATE_IP,
  WEBSITE_RATE_KEY,
} from '../config/website.constants';
import type { IntegrationHandler, WebsiteKeyLookup } from './integration.types';
import { validateWebsiteKey } from './validate-key';

export async function withIntegrationContext<T>(req: Request, handler: IntegrationHandler<T>) {
  assert(
    req.headers.origin === undefined && req.headers.cookie === undefined,
    403,
    'Integrarea acceptă numai cereri de backend fără cookie-uri sau Origin',
  );
  await rateLimit(`website:ip:${req.ip}`, WEBSITE_RATE_IP);
  const match = WEBSITE_TOKEN_PATTERN.exec(req.get('authorization') ?? '');
  assert(match && idSchema.safeParse(match[2]).success, 401, WEBSITE_AUTH_MESSAGE);
  await rateLimit(`website:key:${match[2]}`, WEBSITE_RATE_KEY);
  const digest = websiteKeyHash(match[1]!);
  const rows = await bootstrapDb.$queryRaw<{ data: WebsiteKeyLookup | null }[]>`
      SELECT pos_auth.lookup_website_key(${match[2]}::uuid,${digest}) AS data`;
  const lookup = rows[0]?.data;
  assert(lookup, 401, WEBSITE_AUTH_MESSAGE);
  return withTenantTransaction(runtime, { organizationId: lookup.organizationId }, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lookup.organizationId},0))`;
    const context = await validateWebsiteKey(tx, { ...lookup, digest });
    return handler(tx, context, req);
  });
}

export function integrationEndpoint(handler: IntegrationHandler) {
  return async (req: Request, res: Response) => {
    res.json(await withIntegrationContext(req, handler));
  };
}
