import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  invalidateTenantCache,
  pruneTenantCache,
  readTenantCache,
  writeTenantCache,
} from '../src/index';
import { createSecurityFixture } from './fixtures/security.fixture';

test('Cache PostgreSQL: izolare, expirare, invalidare și rollback', async (t) => {
  const state = await createSecurityFixture();
  const address = { namespace: 'test.menu', key: 'location-a:ro' };
  try {
    await t.test('cheile identice nu amestecă valorile companiilor', async () => {
      await state.txA((tx) =>
        writeTenantCache(tx, { ...address, value: { name: 'A' }, ttlSeconds: 60 }),
      );
      await state.txB((tx) =>
        writeTenantCache(tx, { ...address, value: { name: 'B' }, ttlSeconds: 60 }),
      );
      assert.deepEqual(await state.txA((tx) => readTenantCache(tx, address)), { name: 'A' });
      assert.deepEqual(await state.txB((tx) => readTenantCache(tx, address)), { name: 'B' });
      assert.deepEqual(await state.runtime.$queryRaw`SELECT * FROM "TenantCacheEntry"`, []);
      const foreign = await state.txA(
        (tx) => tx.$queryRaw`
        SELECT * FROM "TenantCacheEntry" WHERE "organizationId"=${state.b.organization.id}::uuid`,
      );
      assert.deepEqual(foreign, []);
      await assert.rejects(
        state.txA(
          (tx) => tx.$executeRaw`
        INSERT INTO "TenantCacheEntry"("organizationId",namespace,key,value,"writtenAt","expiresAt")
        VALUES(${state.b.organization.id}::uuid,'test.menu','foreign','{}',now(),now()+interval '1 minute')`,
        ),
      );
      await assert.rejects(state.auth.$queryRaw`SELECT * FROM "TenantCacheEntry"`);
      await assert.rejects(state.platform.$queryRaw`SELECT * FROM "TenantCacheEntry"`);
    });
    await t.test('suprascriere atomică, invalidare scoped și rollback', async () => {
      await state.txA((tx) =>
        writeTenantCache(tx, { ...address, value: { version: 2 }, ttlSeconds: 60 }),
      );
      assert.deepEqual(await state.txA((tx) => readTenantCache(tx, address)), { version: 2 });
      await assert.rejects(
        state.txA(async (tx) => {
          await writeTenantCache(tx, { ...address, value: { version: 3 }, ttlSeconds: 60 });
          throw new Error('Rollback sintetic');
        }),
      );
      assert.deepEqual(await state.txA((tx) => readTenantCache(tx, address)), { version: 2 });
      assert.equal(await state.txA((tx) => invalidateTenantCache(tx, address)), 1);
      assert.equal(await state.txA((tx) => readTenantCache(tx, address)), null);
      assert.deepEqual(await state.txB((tx) => readTenantCache(tx, address)), { name: 'B' });
    });
    await t.test('datele expirate nu se servesc și curățarea este scoped', async () => {
      for (const transact of [state.txA, state.txB]) {
        await transact(
          (tx) => tx.$executeRaw`
          INSERT INTO "TenantCacheEntry"("organizationId",namespace,key,value,"writtenAt","expiresAt")
          VALUES(current_setting('app.organization_id')::uuid,'test.menu','expired','{}',
            now()-interval '2 minutes',now()-interval '1 minute')`,
        );
      }
      assert.equal(
        await state.txA((tx) => readTenantCache(tx, { ...address, key: 'expired' })),
        null,
      );
      assert.equal(await state.txA((tx) => pruneTenantCache(tx)), 1);
      assert.equal(await state.txA((tx) => pruneTenantCache(tx)), 0);
      assert.equal(await state.txB((tx) => pruneTenantCache(tx)), 1);
    });
    await t.test('limite pentru chei, TTL și payload', async () => {
      for (const ttlSeconds of [0, -1, 86_401, 1.5, Infinity]) {
        await assert.rejects(
          state.txA((tx) => writeTenantCache(tx, { ...address, value: {}, ttlSeconds })),
        );
      }
      await assert.rejects(state.txA((tx) => readTenantCache(tx, { ...address, key: '' })));
      await assert.rejects(
        state.txA((tx) =>
          writeTenantCache(tx, {
            ...address,
            ttlSeconds: 60,
            value: { text: 'x'.repeat(65_536) },
          }),
        ),
      );
      await assert.rejects(
        state.txA(
          (tx) => tx.$executeRaw`
        INSERT INTO "TenantCacheEntry"("organizationId",namespace,key,value,"writtenAt","expiresAt")
        VALUES(${state.a.organization.id}::uuid,'test.menu','invalid-ttl','{}',now(),now()+interval '2 days')`,
        ),
      );
    });
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
