import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createDatabaseClient,
  withTenantTransaction,
  assertRuntimeDatabaseRole,
} from '../../src/index.js';

export async function createSecurityFixture() {
  const runtimeUrl = process.env.TEST_DATABASE_URL;
  if (
    !runtimeUrl ||
    process.env.NODE_ENV === 'production' ||
    new URL(runtimeUrl).pathname !== '/pos_test' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(new URL(runtimeUrl).hostname)
  )
    throw new Error('Security tests require a loopback pos_test database.');
  const sameDatabase = (value: string | undefined) => {
    if (!value || !runtimeUrl) return value;
    const url = new URL(value);
    url.pathname = new URL(runtimeUrl).pathname;
    return url.toString();
  };
  const platformUrl =
    process.env.TEST_PLATFORM_DATABASE_URL ?? sameDatabase(process.env.PLATFORM_DATABASE_URL);
  const authUrl = process.env.TEST_AUTH_DATABASE_URL ?? sameDatabase(process.env.AUTH_DATABASE_URL);
  assert.ok(
    runtimeUrl && platformUrl && authUrl,
    'Testele DB necesită DATABASE_URL, PLATFORM_DATABASE_URL și AUTH_DATABASE_URL; folosiți baza PostgreSQL de test.',
  );
  for (const connection of [runtimeUrl, platformUrl, authUrl]) {
    const url = new URL(connection);
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
    assert.equal(url.pathname, '/pos_test');
  }
  // max=1 forces successive A/B transactions onto the same physical pool connection.
  const runtime = createDatabaseClient(runtimeUrl, 1);
  const platform = createDatabaseClient(platformUrl, 1);
  const auth = createDatabaseClient(authUrl, 1);
  const suffix = randomUUID().slice(0, 8);
  const admin = await platform.platformAdmin.create({
    data: {
      loginNormalized: `test-${suffix}`,
      displayName: 'Administrator sintetic de test',
      passwordHash: '$argon2id$test-fixture-not-a-login-hash',
    },
  });
  const provision = async (label: string) => {
    const rows = await platform.$queryRaw<
      Array<{ result: { organization: { id: string; slug: string }; user: { id: string } } }>
    >`
      SELECT pos_control.provision_organization(${`test-${suffix}-${label}`},${`Companie sintetică ${label}`},NULL::text,
        'same-login','Administrator sintetic','$argon2id$test-fixture-not-a-login-hash',now()+interval '1 day',${admin.id}::uuid) AS result`;
    assert.ok(rows[0]);
    return rows[0].result;
  };
  await assertRuntimeDatabaseRole(runtime);
  const a = await provision('a');
  const b = await provision('b');
  const txA = <T>(fn: Parameters<typeof withTenantTransaction<T>>[2]) =>
    withTenantTransaction(runtime, { organizationId: a.organization.id, userId: a.user.id }, fn);
  const txB = <T>(fn: Parameters<typeof withTenantTransaction<T>>[2]) =>
    withTenantTransaction(runtime, { organizationId: b.organization.id, userId: b.user.id }, fn);
  const locationA = await txA((tx) =>
    tx.location.create({
      data: { organizationId: a.organization.id, code: 'A', name: 'Locație A' },
    }),
  );
  const locationA2 = await txA((tx) =>
    tx.location.create({
      data: { organizationId: a.organization.id, code: 'A2', name: 'Locație A2' },
    }),
  );
  const locationB = await txB((tx) =>
    tx.location.create({
      data: { organizationId: b.organization.id, code: 'B', name: 'Locație B' },
    }),
  );
  return { runtime, platform, auth, suffix, a, b, txA, txB, locationA, locationA2, locationB };
}
