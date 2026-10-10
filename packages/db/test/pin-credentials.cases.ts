import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { PinAuthFixture, PinFunctionPrivileges } from './fixtures/pin-auth.types';

export async function runPinCredentialTests(t: TestContext, state: PinAuthFixture) {
  const { runtime, platform, auth, txA, txB, a, b, workerA, workerB, lookup, pinLookup, data } =
    state;
  await t.test('lookup PIN identifică numai lucrătorul activ al companiei solicitate', async () => {
    assert.equal((await lookup(a.organization.slug))[0]?.result?.user.id, workerA.id);
    assert.equal((await lookup(b.organization.slug))[0]?.result?.user.id, workerB.id);
    assert.equal((await lookup(a.organization.slug))[0]?.result?.user.authenticationMethod, 'PIN');
    assert.equal((await lookup('missing-company'))[0]?.result, null);
    assert.equal((await lookup(a.organization.slug, 'missing-digest'))[0]?.result, null);
    await txB((tx) =>
      tx.companyUser.update({ where: { id: workerB.id }, data: { status: 'DISABLED' } }),
    );
    assert.equal((await lookup(b.organization.slug))[0]?.result, null);
    await txB((tx) =>
      tx.companyUser.update({ where: { id: workerB.id }, data: { status: 'ACTIVE' } }),
    );
  });
  await t.test('digestul este unic în companie, dar poate coincide între companii', async () => {
    assert.equal(workerA.pinLookup, workerB.pinLookup);
    assert.notEqual(workerA.organizationId, workerB.organizationId);
    await assert.rejects(
      txA((tx) =>
        tx.companyUser.create({
          data: {
            ...data,
            organizationId: a.organization.id,
            createdByUserId: a.user.id,
            loginNormalized: 'duplicate-pin-worker',
          },
        }),
      ),
      { code: 'P2002' },
    );
  });
  await t.test(
    'metoda și perechea lookup/hash sunt coerente; plaintext și PIN administrativ sunt respinse',
    async () => {
      for (const change of [
        { pinLookup: null },
        { pinHash: null },
        { pinLookup: '123456' },
        { pinLookup: pinLookup.toUpperCase() },
        { pinHash: '123456' },
        { authenticationMethod: 'UNKNOWN' },
        { authenticationMethod: 'PASSWORD' },
        { mustChangePassword: true },
        { mfaRequired: true },
        { isPrimaryAdmin: true },
      ]) {
        await assert.rejects(
          txA((tx) =>
            tx.companyUser.update({
              where: { id: workerA.id },
              data: change,
            }),
          ),
        );
      }
      await assert.rejects(
        txA((tx) =>
          tx.companyUser.update({
            where: { id: a.user.id },
            data: {
              authenticationMethod: 'PIN',
              pinLookup: 'b'.repeat(64),
              pinHash: data.pinHash,
              mustChangePassword: false,
            },
          }),
        ),
      );
      const primary = await txA((tx) =>
        tx.companyUser.findUniqueOrThrow({ where: { id: a.user.id } }),
      );
      assert.equal(primary.authenticationMethod, 'PASSWORD');
      assert.equal(primary.pinHash, null);
      assert.equal(primary.pinLookup, null);
    },
  );
  await t.test('RLS și privilegii: noile hashuri nu creează citire globală', async () => {
    assert.deepEqual(
      await runtime.companyUser.findMany({ select: { pinLookup: true, pinHash: true } }),
      [],
    );
    const scoped = await txA((tx) =>
      tx.companyUser.findMany({ where: { authenticationMethod: 'PIN' } }),
    );
    assert.deepEqual(
      scoped.map((user) => user.id),
      [workerA.id],
    );
    await assert.rejects(auth.companyUser.findMany({ select: { pinLookup: true, pinHash: true } }));
    await assert.rejects(
      platform.companyUser.findMany({ select: { pinLookup: true, pinHash: true } }),
    );
    for (const client of [runtime, platform]) {
      await assert.rejects(
        client.$queryRaw`SELECT pos_auth.lookup_tenant_pin(${a.organization.slug},${pinLookup})`,
      );
    }
    await assert.rejects(
      txA((tx) =>
        tx.companyUser.create({
          data: {
            ...data,
            organizationId: b.organization.id,
            createdByUserId: b.user.id,
            loginNormalized: 'cross-tenant-pin-worker',
          },
        }),
      ),
    );
  });
  await t.test(
    'funcția PIN este definer restrâns, cu search_path fix și fără grant CREATE rămas',
    async () => {
      const rows = await runtime.$queryRaw<PinFunctionPrivileges[]>`
      SELECT owner.rolname AS owner, p.prosecdef AS "securityDefiner", p.proconfig AS settings,
        has_function_privilege('pos_auth',p.oid,'EXECUTE') AS "authExecute",
        has_function_privilege('pos_runtime',p.oid,'EXECUTE') AS "runtimeExecute",
        has_function_privilege('pos_platform',p.oid,'EXECUTE') AS "platformExecute",
        has_schema_privilege('pos_internal','pos_auth','CREATE') AS "internalCreate"
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        JOIN pg_roles owner ON owner.oid=p.proowner
      WHERE n.nspname='pos_auth' AND p.proname='lookup_tenant_pin'`;
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0], {
        owner: 'pos_internal',
        securityDefiner: true,
        settings: ['search_path=pg_catalog, public'],
        authExecute: true,
        runtimeExecute: false,
        platformExecute: false,
        internalCreate: false,
      });
    },
  );
}
