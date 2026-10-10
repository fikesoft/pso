import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSecurityFixture } from './fixtures/security.fixture';

test('PostgreSQL real: identitate/control cu ACL funcțional independent de schema USAGE', async () => {
  // Provisioning through the intended platform role is exercised by this fixture.
  const state = await createSecurityFixture();
  try {
    const rows = await state.runtime.$queryRaw<
      Array<{
        schema: string;
        name: string;
        publicExecute: boolean;
        runtimeExecute: boolean;
        workerExecute: boolean;
        authExecute: boolean;
        platformExecute: boolean;
      }>
    >`
      SELECT n.nspname AS schema,p.proname AS name,
        EXISTS(SELECT 1 FROM aclexplode(p.proacl) a
          WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS "publicExecute",
        has_function_privilege('pos_runtime',p.oid,'EXECUTE') AS "runtimeExecute",
        has_function_privilege('pos_worker',p.oid,'EXECUTE') AS "workerExecute",
        has_function_privilege('pos_auth',p.oid,'EXECUTE') AS "authExecute",
        has_function_privilege('pos_platform',p.oid,'EXECUTE') AS "platformExecute"
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE (n.nspname='pos_auth' AND p.proname IN ('lookup_tenant_login','lookup_tenant_session'))
        OR (n.nspname='pos_control' AND p.proname IN ('list_organizations','provision_organization'))`;
    assert.equal(rows.length, 4);
    for (const row of rows) {
      // Function privilege lookup uses OIDs and does not depend on schema USAGE.
      assert.equal(row.publicExecute, false);
      assert.equal(row.runtimeExecute, false);
      assert.equal(row.workerExecute, false);
      assert.equal(row.authExecute, row.schema === 'pos_auth');
      assert.equal(row.platformExecute, row.schema === 'pos_control');
    }
    const login = await state.auth.$queryRaw<Array<{ result: { user: { id: string } } }>>`
      SELECT pos_auth.lookup_tenant_login(${state.a.organization.slug},'same-login') AS result`;
    assert.equal(login[0]?.result.user.id, state.a.user.id);
    const session = await state.auth.$queryRaw<Array<{ result: null }>>`
      SELECT pos_auth.lookup_tenant_session('nonexistent-synthetic-token') AS result`;
    assert.equal(session[0]?.result, null);
    const organizations = await state.platform.$queryRaw<Array<{ result: { id: string } }>>`
      SELECT pos_control.list_organizations() AS result`;
    assert.ok(organizations.some((row) => row.result.id === state.a.organization.id));
    await assert.rejects(state.runtime.$queryRaw`SELECT pos_control.list_organizations()`);
    await assert.rejects(
      state.platform.$queryRaw`SELECT pos_auth.lookup_tenant_login('none','none')`,
    );
    await assert.rejects(state.auth.$queryRaw`SELECT pos_control.list_organizations()`);
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
