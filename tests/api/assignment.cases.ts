import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  BrowserSession,
  activate,
  db,
  passwordHash,
  fixturePasswords,
  noSecrets,
} from './support/harness';

export function registerAssignmentTests() {
  it('reatribuirea înlocuiește versiunea aceluiași rol numai în scope-ul ales și păstrează istoricul', async () => {
    const suffix = randomUUID().slice(0, 8);
    const password = `Reassign-${randomUUID()}`;
    fixturePasswords.add(password);
    const owner = await db.platformDb.platformAdmin.create({
      data: {
        loginNormalized: `reassign-${suffix}`,
        displayName: 'Owner sintetic reatribuire',
        passwordHash: await passwordHash(password),
      },
    });
    const platform = new BrowserSession('PLATFORM');
    await platform.login(owner.loginNormalized, password);
    await platform.enroll();
    const company = await platform.expect(
      '/organizations',
      'POST',
      {
        slug: `reassign-${suffix}`,
        name: 'Companie sintetică reatribuire',
        adminLogin: 'admin',
        adminDisplayName: 'Administrator sintetic',
      },
      201,
    );
    const primary = new BrowserSession('TENANT');
    await activate(primary, 'admin', company.temporaryPassword, company.organization.slug);
    await primary.enroll();
    const primaryId = (await primary.expect('/auth/session')).user.id;
    const locationA = (
      await primary.expect('/locations', 'POST', { name: 'Locație A', code: 'LOC_A' })
    ).location;
    const locationB = (
      await primary.expect('/locations', 'POST', { name: 'Locație B', code: 'LOC_B' })
    ).location;
    const scopeA = { scopeType: 'LOCATION', locationId: locationA.id };
    const scopeB = { scopeType: 'LOCATION', locationId: locationB.id };
    const broad = (
      await primary.expect('/roles', 'POST', {
        name: 'Comenzi',
        permissions: [{ permission: 'orders.read' }, { permission: 'orders.create' }],
      })
    ).role;
    const independent = (
      await primary.expect('/roles', 'POST', {
        name: 'Bucătărie',
        permissions: [{ permission: 'kitchen.read' }],
      })
    ).role;
    const managerRole = (
      await primary.expect('/roles', 'POST', {
        name: 'Administrarea atribuirilor',
        permissions: [{ permission: 'staff.access' }],
      })
    ).role;
    const managerUser = await primary.expect('/staff', 'POST', {
      login: 'manager',
      displayName: 'Manager sintetic',
      locationIds: [locationA.id, locationB.id],
      assignments: [{ roleVersionId: managerRole.versions[0].id, scopeType: 'ORGANIZATION' }],
    });
    const created = await primary.expect('/staff', 'POST', {
      login: 'worker',
      displayName: 'Lucrător sintetic reatribuire',
      managedByUserId: managerUser.user.id,
      locationIds: [locationA.id, locationB.id],
      assignments: [
        { ...scopeA, roleVersionId: broad.versions[0].id },
        { ...scopeB, roleVersionId: broad.versions[0].id },
        { ...scopeA, roleVersionId: independent.versions[0].id },
      ],
    });
    const worker = new BrowserSession('TENANT');
    const activated = await activate(
      worker,
      'worker',
      created.temporaryPassword,
      company.organization.slug,
    );
    const can = (context: any, key: string, locationId: string) =>
      context.permissions.find(
        (entry: any) => entry.permission === key && entry.locationId === locationId,
      )?.canUse;
    const original = await worker.expect('/context');
    expect(can(original, 'orders.create', locationA.id)).toBe(true);
    expect(can(original, 'orders.create', locationB.id)).toBe(true);
    const beforeUsers = await primary.expect('/staff');
    const originalAssignment = beforeUsers.users
      .find((user: any) => user.id === created.user.id)
      .assignments.find(
        (entry: any) =>
          entry.roleVersionId === broad.versions[0].id && entry.locationId === locationA.id,
      );
    const manager = new BrowserSession('TENANT');
    await activate(manager, 'manager', managerUser.temporaryPassword, company.organization.slug);
    await manager.enroll();
    // This actor can administer the subordinate, but cannot withdraw a grant
    // issued directly by its superior. A successful preview proves the relation.
    await manager.expect('/access/preview', 'POST', { userId: created.user.id, ...scopeA });
    expect(
      (
        await manager.call(
          `/staff/${created.user.id}/assignments/${originalAssignment.id}`,
          'DELETE',
          {},
        )
      ).status,
    ).toBe(403);
    // Publishing a narrower version does not silently change assigned immutable v1.
    const narrow = (
      await primary.expect(`/roles/${broad.id}/versions`, 'POST', {
        permissions: [{ permission: 'orders.read' }],
      })
    ).version;
    expect(can(await worker.expect('/context'), 'orders.create', locationA.id)).toBe(true);
    // Rejected reassignment leaves the old assignment and session intact.
    expect(
      (
        await primary.call(`/staff/${created.user.id}/assignments`, 'POST', {
          ...scopeA,
          roleVersionId: randomUUID(),
        })
      ).status,
    ).toBe(404);
    expect(can(await worker.expect('/context'), 'orders.create', locationA.id)).toBe(true);
    await primary.expect(`/staff/${created.user.id}/assignments`, 'POST', {
      ...scopeA,
      roleVersionId: narrow.id,
    });
    expect((await worker.call('/context')).status).toBe(401);
    await worker.login('worker', activated.permanent, company.organization.slug);
    const changed = await worker.expect('/context');
    expect(can(changed, 'orders.read', locationA.id)).toBe(true);
    expect(can(changed, 'orders.create', locationA.id)).toBe(false);
    expect(can(changed, 'orders.create', locationB.id)).toBe(true);
    expect(can(changed, 'kitchen.read', locationA.id)).toBe(true);
    const history = await db.withTenantTransaction(
      db.runtime,
      { organizationId: company.organization.id, userId: primaryId },
      (tx) => tx.userRoleAssignment.findMany({ where: { userId: created.user.id } }),
    );
    expect(history.find((entry) => entry.id === originalAssignment.id)?.revokedAt).not.toBeNull();
    expect(history.filter((entry) => !entry.revokedAt)).toHaveLength(3);
    const versions = await primary.expect('/roles');
    expect(
      versions.roles
        .find((role: any) => role.id === broad.id)
        .versions.find((version: any) => version.id === broad.versions[0].id)
        .permissions.map((entry: any) => entry.permission),
    ).toEqual(expect.arrayContaining(['orders.read', 'orders.create']));
    // Repeating the explicit assignment keeps one active version, not a second grant.
    await primary.expect(`/staff/${created.user.id}/assignments`, 'POST', {
      ...scopeA,
      roleVersionId: narrow.id,
    });
    const users = await primary.expect('/staff');
    const activeAssignments = users.users.find(
      (user: any) => user.id === created.user.id,
    ).assignments;
    expect(
      activeAssignments.filter(
        (entry: any) => entry.roleVersionId === narrow.id && entry.locationId === locationA.id,
      ),
    ).toHaveLength(1);
    const selected = activeAssignments.find(
      (entry: any) => entry.roleVersionId === narrow.id && entry.locationId === locationA.id,
    );
    await worker.login('worker', activated.permanent, company.organization.slug);
    expect(
      (await worker.call(`/staff/${created.user.id}/assignments/${selected.id}`, 'DELETE', {}))
        .status,
    ).toBe(403);
    expect(
      (await primary.call(`/staff/${primaryId}/assignments/${selected.id}`, 'DELETE', {})).status,
    ).toBe(404);
    await primary.expect(`/staff/${created.user.id}/assignments/${selected.id}`, 'DELETE', {});
    expect((await worker.call('/context')).status).toBe(401);
    await worker.login('worker', activated.permanent, company.organization.slug);
    const withdrawn = await worker.expect('/context');
    expect(can(withdrawn, 'orders.read', locationA.id)).toBe(false);
    expect(can(withdrawn, 'orders.create', locationB.id)).toBe(true);
    expect(can(withdrawn, 'kitchen.read', locationA.id)).toBe(true);
    const audit = await primary.expect('/audit');
    expect(audit.events.some((entry: any) => entry.action === 'staff.role.revoked')).toBe(true);
    noSecrets(audit);
  }, 30000);
}
