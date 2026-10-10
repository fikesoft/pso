import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src/index';

function localTestUrl(value: string | undefined): string {
  if (!value || process.env.NODE_ENV === 'production')
    throw new Error('Auth rate limit test requires local PostgreSQL.');
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Auth rate limit test requires local PostgreSQL.');
  url.pathname = '/pos_test';
  return url.toString();
}

test('PostgreSQL auth throttle persists across clients and enforces narrow ACLs', async () => {
  const authUrl = localTestUrl(process.env.TEST_AUTH_DATABASE_URL ?? process.env.AUTH_DATABASE_URL);
  const platformUrl = localTestUrl(
    process.env.TEST_PLATFORM_DATABASE_URL ?? process.env.PLATFORM_DATABASE_URL,
  );
  const runtime = createDatabaseClient(localTestUrl(process.env.TEST_DATABASE_URL));
  const migrator = createDatabaseClient(localTestUrl(process.env.MIGRATION_DATABASE_URL));
  const authA = createDatabaseClient(authUrl);
  const authB = createDatabaseClient(authUrl);
  const platform = createDatabaseClient(platformUrl);
  const digest = createHash('sha256').update(randomUUID()).digest('hex');
  const consume = (client: typeof authA, limit = 2, windowMs = 60_000) =>
    client.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT pos_auth.consume_auth_rate_limit(${digest},${limit},${windowMs}) AS allowed`;
  try {
    const concurrent = await Promise.all([consume(authA), consume(authB), consume(platform)]);
    assert.deepEqual(concurrent.map((rows) => rows[0]?.allowed).sort(), [false, true, true]);
    assert.equal((await consume(authB))[0]?.allowed, false);
    await authA.$disconnect();
    const restarted = createDatabaseClient(authUrl);
    try {
      assert.equal((await consume(restarted))[0]?.allowed, false);
    } finally {
      await restarted.$disconnect();
    }
    await assert.rejects(consume(runtime));
    await assert.rejects(runtime.$queryRaw`SELECT * FROM public."AuthRateLimitBucket"`);
    await assert.rejects(authB.$queryRaw`SELECT * FROM public."AuthRateLimitBucket"`);
    await assert.rejects(platform.$executeRaw`DELETE FROM public."AuthRateLimitBucket"`);
    await assert.rejects(
      platform.$queryRaw`SELECT pos_auth.lookup_tenant_login('synthetic','synthetic')`,
    );
    await assert.rejects(consume(authB, 0));

    const expiring = createHash('sha256').update(randomUUID()).digest('hex');
    const short = () =>
      authB.$queryRaw<Array<{ allowed: boolean }>>`
        SELECT pos_auth.consume_auth_rate_limit(${expiring},1,1000) AS allowed`;
    assert.equal((await short())[0]?.allowed, true);
    assert.equal((await short())[0]?.allowed, false);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal((await short())[0]?.allowed, true);

    const expiredTarget = createHash('sha256').update(randomUUID()).digest('hex');
    const salt = randomUUID();
    await migrator.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE pos_internal');
      await tx.$executeRaw`
        INSERT INTO public."AuthRateLimitBucket"(digest,attempts,"expiresAt")
        SELECT repeat(md5(${salt} || n::text),2),2,now()-interval '2 minutes'
        FROM generate_series(1,1001) AS n`;
      await tx.$executeRaw`
        INSERT INTO public."AuthRateLimitBucket"(digest,attempts,"expiresAt")
        VALUES(${expiredTarget},2,now()-interval '1 minute')`;
    });
    const reset = await authB.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT pos_auth.consume_auth_rate_limit(${expiredTarget},1,1000) AS allowed`;
    assert.equal(reset[0]?.allowed, true);
  } finally {
    await Promise.all([
      authA.$disconnect(),
      authB.$disconnect(),
      platform.$disconnect(),
      runtime.$disconnect(),
      migrator.$disconnect(),
    ]);
  }
});
