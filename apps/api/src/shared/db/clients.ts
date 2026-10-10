import { createDatabaseClient, withTenantTransaction } from '@pos/db';
import type { PrismaClient } from '@pos/db';
import { config } from '../config';
// Each process may receive only credentials for its surface. Clients initialize on first use.
function lazyClient(url: string | undefined, name: string): PrismaClient {
  let client: PrismaClient | undefined;
  return new Proxy({} as PrismaClient, {
    get(_target, key) {
      if (!url) throw new Error(`${name} lipsește pentru această operațiune`);
      client ??= createDatabaseClient(url);
      const value = Reflect.get(client, key);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
}
export const runtime = lazyClient(config.DATABASE_URL, 'DATABASE_URL');
export const bootstrapDb = lazyClient(config.AUTH_DATABASE_URL, 'AUTH_DATABASE_URL');
export const platformDb = lazyClient(config.PLATFORM_DATABASE_URL, 'PLATFORM_DATABASE_URL');
export { withTenantTransaction };
