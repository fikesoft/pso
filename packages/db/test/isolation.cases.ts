import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { SecurityFixture } from './fixtures/security.types';
import { withTenantTransaction } from '../src/index.js';

export async function runIsolationTests(t: TestContext, state: SecurityFixture) {
  const { runtime, platform, auth, a, b, txA, txB, locationA, locationB } = state;

  await t.test('runtime nu este owner/superuser/BYPASSRLS și nu poate SET ROLE', async () => {
    const privileges = await runtime.$queryRaw<
      Array<{ canCreate: boolean }>
    >`SELECT has_schema_privilege(current_user,'public','CREATE') AS "canCreate"`;
    assert.equal(privileges[0]?.canCreate, false, 'Runtime nu poate crea obiecte în schema public');
    await assert.rejects(runtime.$executeRawUnsafe('SET ROLE pos_migrator'));
    await assert.rejects(runtime.platformAdmin.findMany());
    await assert.rejects(runtime.$queryRawUnsafe('SELECT pos_control.list_organizations()'));
    await assert.rejects(platform.companyUser.findMany());
    await assert.rejects(auth.companyUser.findMany());
  });
  await t.test('fără context: zero rânduri și WITH CHECK respinge insert', async () => {
    assert.deepEqual(await runtime.location.findMany(), []);
    assert.deepEqual(await runtime.$queryRawUnsafe('SELECT * FROM "CompanyUser"'), []);
    await assert.rejects(
      runtime.location.create({
        data: { organizationId: a.organization.id, code: 'BLOCKED', name: 'Nu se creează' },
      }),
    );
  });
  await t.test(
    'USING filtrează ID/filtru/join și WITH CHECK respinge INSERT/UPDATE străin',
    async () => {
      await txA(async (tx) => {
        assert.equal(await tx.location.findUnique({ where: { id: locationB.id } }), null);
        assert.equal(
          await tx.companyUser.count({ where: { organizationId: b.organization.id } }),
          0,
        );
        const rows = await tx.$queryRaw<
          Array<{ organizationId: string }>
        >`SELECT u."organizationId" FROM "CompanyUser" u JOIN "Location" l ON l."organizationId"=u."organizationId"`;
        assert.ok(rows.every((row) => row.organizationId === a.organization.id));
      });
      await assert.rejects(
        txA((tx) =>
          tx.location.create({
            data: { organizationId: b.organization.id, code: 'CROSS', name: 'Respins' },
          }),
        ),
      );
      await assert.rejects(
        txA((tx) =>
          tx.location.update({
            where: { id: locationA.id },
            data: { organizationId: b.organization.id },
          }),
        ),
      );
      assert.equal(
        await txA((tx) =>
          tx.location.updateMany({ where: { id: locationB.id }, data: { name: 'Respins' } }),
        ).then((x) => x.count),
        0,
      );
    },
  );
  await t.test('pool reutilizat A→B→absent și rollback nu păstrează context', async () => {
    const rowsA = await txA((tx) => tx.location.findMany());
    const rowsB = await txB((tx) => tx.location.findMany());
    assert.ok(rowsA.every((row) => row.organizationId === a.organization.id));
    assert.ok(rowsB.every((row) => row.organizationId === b.organization.id));
    assert.deepEqual(await runtime.location.findMany(), []);
    await assert.rejects(
      txA(async (tx) => {
        await tx.location.findMany();
        throw new Error('rollback sintetic');
      }),
    );
    assert.deepEqual(await runtime.location.findMany(), []);
    await assert.rejects(
      withTenantTransaction(runtime, { organizationId: 'not-a-uuid' }, async () => true),
    );
  });
  await t.test('FK compuse resping utilizator/locație/manager din alt tenant', async () => {
    await assert.rejects(
      txA((tx) =>
        tx.userLocationAccess.create({
          data: {
            organizationId: a.organization.id,
            userId: a.user.id,
            locationId: locationB.id,
          },
        }),
      ),
    );
    await assert.rejects(
      txA((tx) =>
        tx.userLocationAccess.create({
          data: {
            organizationId: a.organization.id,
            userId: b.user.id,
            locationId: locationA.id,
          },
        }),
      ),
    );
    await assert.rejects(
      txA((tx) =>
        tx.companyUser.create({
          data: {
            organizationId: a.organization.id,
            loginNormalized: 'bad-manager',
            displayName: 'Test',
            passwordHash: 'unused',
            createdByUserId: a.user.id,
            managedByUserId: b.user.id,
          },
        }),
      ),
    );
  });
  await t.test('login identic separat în două companii și lookup auth minimal', async () => {
    const row = await auth.$queryRaw<
      Array<{ result: { user: { organizationId: string } } }>
    >`SELECT pos_auth.lookup_tenant_login(${a.organization.slug},'same-login') AS result`;
    assert.equal(row[0]?.result.user.organizationId, a.organization.id);
    const rowB = await auth.$queryRaw<
      Array<{ result: { user: { organizationId: string } } }>
    >`SELECT pos_auth.lookup_tenant_login(${b.organization.slug},'same-login') AS result`;
    assert.equal(rowB[0]?.result.user.organizationId, b.organization.id);
    assert.equal(
      (
        await auth.$queryRaw<
          Array<{ result: null }>
        >`SELECT pos_auth.lookup_tenant_login('missing','same-login') AS result`
      )[0]?.result,
      null,
    );
  });
}
