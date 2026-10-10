import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { SecurityFixture } from './fixtures/security.types';
import { randomUUID, createHash } from 'node:crypto';

export async function runHistoryTests(t: TestContext, state: SecurityFixture) {
  const { runtime, auth, suffix, a, b, txA, locationA, locationA2 } = state;

  await t.test('maxim o locație implicită per utilizator', async () => {
    await txA((tx) =>
      tx.userLocationAccess.create({
        data: {
          organizationId: a.organization.id,
          userId: a.user.id,
          locationId: locationA.id,
          isDefault: true,
        },
      }),
    );
    await assert.rejects(
      txA((tx) =>
        tx.userLocationAccess.create({
          data: {
            organizationId: a.organization.id,
            userId: a.user.id,
            locationId: locationA2.id,
            isDefault: true,
          },
        }),
      ),
    );
  });
  const role = await txA((tx) =>
    tx.role.create({
      data: {
        organizationId: a.organization.id,
        name: `Rol ${suffix}`,
        createdByUserId: a.user.id,
      },
    }),
  );
  const version = await txA((tx) =>
    tx.roleVersion.create({
      data: {
        organizationId: a.organization.id,
        roleId: role.id,
        version: 1,
        createdByUserId: a.user.id,
      },
    }),
  );
  const worker = await txA((tx) =>
    tx.companyUser.create({
      data: {
        organizationId: a.organization.id,
        loginNormalized: `worker-${suffix}`,
        displayName: 'Lucrător sintetic',
        passwordHash: 'unused',
        createdByUserId: a.user.id,
        managedByUserId: a.user.id,
      },
    }),
  );
  await t.test('scope CHECK și indexuri parțiale elimină duplicate inclusiv NULL', async () => {
    const base = {
      organizationId: a.organization.id,
      userId: worker.id,
      roleVersionId: version.id,
      issuedByUserId: a.user.id,
    };
    await assert.rejects(
      txA((tx) => tx.userRoleAssignment.create({ data: { ...base, scopeType: 'LOCATION' } })),
    );
    await assert.rejects(
      txA((tx) =>
        tx.userRoleAssignment.create({
          data: { ...base, scopeType: 'ORGANIZATION', locationId: locationA.id },
        }),
      ),
    );
    await txA((tx) =>
      tx.userRoleAssignment.create({ data: { ...base, scopeType: 'ORGANIZATION' } }),
    );
    await assert.rejects(
      txA((tx) => tx.userRoleAssignment.create({ data: { ...base, scopeType: 'ORGANIZATION' } })),
    );
    await txA((tx) =>
      tx.userRoleAssignment.create({
        data: { ...base, scopeType: 'LOCATION', locationId: locationA.id },
      }),
    );
    await assert.rejects(
      txA((tx) =>
        tx.userRoleAssignment.create({
          data: { ...base, scopeType: 'LOCATION', locationId: locationA.id },
        }),
      ),
    );
    await txA((tx) =>
      tx.userRoleAssignment.create({
        data: { ...base, scopeType: 'LOCATION', locationId: locationA2.id },
      }),
    );
    await assert.rejects(
      txA((tx) =>
        tx.userRoleAssignment.create({
          data: { ...base, userId: b.user.id, scopeType: 'ORGANIZATION' },
        }),
      ),
    );
  });
  await t.test(
    'rolurile sunt imuabile inclusiv SQL brut; permisiuni noi nu se adaugă ulterior',
    async () => {
      await assert.rejects(
        txA((tx) => tx.roleVersion.update({ where: { id: version.id }, data: { version: 2 } })),
      );
      await assert.rejects(
        txA(
          (tx) => tx.$executeRaw`UPDATE "RoleVersion" SET version=2 WHERE id=${version.id}::uuid`,
        ),
      );
      const permissions = await runtime.permission.findMany({ take: 1 });
      if (permissions[0])
        await assert.rejects(
          txA((tx) =>
            tx.rolePermission.create({
              data: {
                organizationId: a.organization.id,
                roleVersionId: version.id,
                permissionKey: permissions[0]!.key,
              },
            }),
          ),
        );
      else throw new Error('Catalogul Permission trebuie populat prin migrație.');
    },
  );
  await t.test('PrimaryAdmin nu se dezactivează/promovează prin runtime', async () => {
    await assert.rejects(
      txA((tx) =>
        tx.companyUser.update({ where: { id: a.user.id }, data: { status: 'DISABLED' } }),
      ),
    );
    await assert.rejects(
      txA((tx) =>
        tx.companyUser.update({
          where: { id: worker.id },
          data: { isPrimaryAdmin: true, mfaRequired: true },
        }),
      ),
    );
    await assert.rejects(
      txA((tx) =>
        tx.organization.update({
          where: { id: a.organization.id },
          data: { primaryAdminUserId: worker.id },
        }),
      ),
    );
  });
  await t.test('audit append-only pentru rolul aplicației', async () => {
    const event = await txA((tx) =>
      tx.auditEvent.create({
        data: {
          organizationId: a.organization.id,
          actorUserId: a.user.id,
          action: 'test.security',
          targetType: 'test',
          outcome: 'SUCCESS',
          requestId: randomUUID(),
        },
      }),
    );
    await assert.rejects(
      txA((tx) => tx.auditEvent.update({ where: { id: event.id }, data: { action: 'tampered' } })),
    );
    await assert.rejects(txA((tx) => tx.auditEvent.delete({ where: { id: event.id } })));
  });
  await t.test('sesiuni expirate/revocate sau authVersion schimbată nu se rezolvă', async () => {
    const tokenHash = createHash('sha256').update(randomUUID()).digest('hex');
    const expiresAt = new Date(Date.now() + 60000);
    const session = await txA((tx) =>
      tx.tenantSession.create({
        data: {
          organizationId: a.organization.id,
          userId: worker.id,
          tokenHash,
          authVersion: 1,
          policyVersion: 1,
          expiresAt,
          idleExpiresAt: expiresAt,
        },
      }),
    );
    const lookup = () =>
      auth.$queryRaw<
        Array<{ result: unknown }>
      >`SELECT pos_auth.lookup_tenant_session(${tokenHash}) AS result`;
    assert.ok((await lookup())[0]?.result);
    await txA((tx) =>
      tx.companyUser.update({
        where: { id: worker.id },
        data: { authVersion: { increment: 1 } },
      }),
    );
    assert.equal((await lookup())[0]?.result, null);
    await txA((tx) =>
      tx.tenantSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
    );
    assert.equal((await lookup())[0]?.result, null);
  });
}
