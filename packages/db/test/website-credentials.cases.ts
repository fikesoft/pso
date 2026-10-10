import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { OperationsRlsStatus } from './fixtures/operations.types';
import type { WebsiteFixture, WebsiteLookupPrivileges } from './fixtures/website.types';

export async function runWebsiteCredentialTests(t: TestContext, state: WebsiteFixture) {
  const { runtime, auth, platform, txA, txB, a, b, keyA, keyB, connectionA, lookup, createKey } =
    state;
  await t.test('lookup restrâns validează cheia și returnează numai contextul minim', async () => {
    const result = (await lookup())[0]?.result;
    assert.ok(result);
    assert.deepEqual(Object.keys(result).sort(), [
      'connectionId',
      'createdByUserId',
      'expiresAt',
      'keyId',
      'locationId',
      'organizationId',
    ]);
    assert.equal(result.organizationId, a.organization.id);
    assert.equal(result.locationId, state.locationA.id);
    assert.equal(result.createdByUserId, a.user.id);
    assert.equal(
      (await lookup(keyB.id, keyB.secretHash))[0]?.result?.organizationId,
      b.organization.id,
    );
    assert.equal((await lookup(keyB.id, keyA.secretHash))[0]?.result, null);
    assert.equal((await lookup(randomUUID()))[0]?.result, null);
    assert.equal((await lookup(keyA.id, 'invalid-hash'))[0]?.result, null);
  });
  await t.test(
    'pauza conexiunii, locația inactivă, expirarea și revocarea retrag cheia',
    async () => {
      await txA((tx) =>
        tx.websiteConnection.update({
          where: { id: connectionA.id },
          data: { status: 'PAUSED', version: { increment: 1 } },
        }),
      );
      assert.equal((await lookup())[0]?.result, null);
      await assert.rejects(state.createInbound());
      await txA((tx) =>
        tx.websiteConnection.update({
          where: { id: connectionA.id },
          data: { status: 'ACTIVE', version: { increment: 1 } },
        }),
      );
      await txA((tx) =>
        tx.location.update({ where: { id: state.locationA.id }, data: { status: 'DISABLED' } }),
      );
      assert.equal((await lookup())[0]?.result, null);
      await txA((tx) =>
        tx.location.update({ where: { id: state.locationA.id }, data: { status: 'ACTIVE' } }),
      );
      const expired = await createKey('a', {
        createdAt: new Date(Date.now() - 20_000),
        expiresAt: new Date(Date.now() - 10_000),
      });
      assert.equal((await lookup(expired.id, expired.secretHash))[0]?.result, null);
      const revoked = await createKey();
      await txA((tx) =>
        tx.websiteApiKey.update({ where: { id: revoked.id }, data: { revokedAt: new Date() } }),
      );
      assert.equal((await lookup(revoked.id, revoked.secretHash))[0]?.result, null);
      await assert.rejects(state.createInbound({ header: { createdWithKeyId: revoked.id } }));
      await assert.rejects(
        txA((tx) =>
          tx.websiteApiKey.update({ where: { id: revoked.id }, data: { revokedAt: null } }),
        ),
      );
      assert.ok((await lookup())[0]?.result);
    },
  );
  await t.test(
    'numai PrimaryAdmin emite chei; digestul și contextul nu pot fi înlocuite',
    async () => {
      const worker = await txA((tx) =>
        tx.companyUser.create({
          data: {
            organizationId: a.organization.id,
            loginNormalized: `website-worker-${state.suffix}`,
            displayName: 'Lucrător sintetic',
            passwordHash: '$argon2id$synthetic-nonlogin',
            createdByUserId: a.user.id,
          },
        }),
      );
      await assert.rejects(createKey('a', { createdByUserId: worker.id }));
      await assert.rejects(createKey('a', { secretHash: 'plaintext-key' }));
      await assert.rejects(createKey('a', { locationId: state.locationA2.id }));
      await assert.rejects(
        txA((tx) =>
          tx.websiteApiKey.update({ where: { id: keyA.id }, data: { secretHash: 'a'.repeat(64) } }),
        ),
      );
      await assert.rejects(
        txA((tx) =>
          tx.websiteConnection.update({
            where: { id: connectionA.id },
            data: { locationId: state.locationA2.id, version: { increment: 1 } },
          }),
        ),
      );
      await assert.rejects(
        txA((tx) =>
          tx.websiteConnection.update({
            where: { id: connectionA.id },
            data: { name: 'Fără versiune' },
          }),
        ),
      );
    },
  );
  await t.test(
    'FORCE RLS și ACL blochează citirea globală, tenantul străin și ștergerea',
    async () => {
      assert.deepEqual(await runtime.websiteApiKey.findMany(), []);
      assert.deepEqual(await runtime.websiteConnection.findMany(), []);
      assert.equal(
        await txA((tx) => tx.websiteApiKey.findUnique({ where: { id: keyB.id } })),
        null,
      );
      assert.equal(
        await txB((tx) => tx.websiteConnection.findUnique({ where: { id: connectionA.id } })),
        null,
      );
      for (const client of [auth, platform]) {
        await assert.rejects(client.websiteApiKey.findMany());
        await assert.rejects(client.websiteOrder.findMany());
      }
      for (const client of [runtime, platform]) {
        await assert.rejects(
          client.$queryRaw`SELECT pos_auth.lookup_website_key(${keyA.id}::uuid,${keyA.secretHash})`,
        );
      }
      await assert.rejects(txA((tx) => tx.websiteApiKey.delete({ where: { id: keyA.id } })));
      await assert.rejects(
        txA((tx) => tx.websiteConnection.delete({ where: { id: connectionA.id } })),
      );
      const policies = await runtime.$queryRaw<OperationsRlsStatus[]>`
      SELECT relname AS "tableName",relrowsecurity AS enabled,relforcerowsecurity AS forced
      FROM pg_class WHERE relname IN ('WebsiteConnection','WebsiteApiKey','WebsiteOrder','WebsiteOrderItem')`;
      assert.equal(policies.length, 4);
      assert.ok(policies.every((row) => row.enabled && row.forced));
    },
  );
  await t.test(
    'lookup are owner NOLOGIN, search_path fix și EXECUTE numai pentru pos_auth',
    async () => {
      const rows = await runtime.$queryRaw<WebsiteLookupPrivileges[]>`
      SELECT owner.rolname AS owner,owner.rolcanlogin AS "ownerCanLogin",p.prosecdef AS "securityDefiner",p.proconfig AS settings,
        has_function_privilege('pos_auth',p.oid,'EXECUTE') AS "authExecute",
        has_function_privilege('pos_runtime',p.oid,'EXECUTE') AS "runtimeExecute",
        has_function_privilege('pos_platform',p.oid,'EXECUTE') AS "platformExecute",
        has_schema_privilege('pos_internal','pos_auth','CREATE') AS "internalCreate"
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles owner ON owner.oid=p.proowner
      WHERE n.nspname='pos_auth' AND p.proname='lookup_website_key'`;
      assert.deepEqual(rows, [
        {
          owner: 'pos_internal',
          ownerCanLogin: false,
          securityDefiner: true,
          settings: ['search_path=pg_catalog, public'],
          authExecute: true,
          runtimeExecute: false,
          platformExecute: false,
          internalCreate: false,
        },
      ]);
    },
  );
}
