import { expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BrowserSession, activate, db, passwordHash, fixturePasswords } from './support/harness';

export async function prepareFoundationScenario() {
  const suffix = randomUUID().slice(0, 8);
  const platformPassword = `Platform-${randomUUID()}`;
  fixturePasswords.add(platformPassword);
  const platformAdmin = await db.platformDb.platformAdmin.create({
    data: {
      loginNormalized: `platform-${suffix}`,
      displayName: 'Platformă sintetică',
      passwordHash: await passwordHash(platformPassword),
    },
  });
  const platform = new BrowserSession('PLATFORM');
  const platformLogin = await platform.login(platformAdmin.loginNormalized, platformPassword);
  expect(platformLogin.stage).toBe('enroll');
  expect((await platform.call('/organizations')).status).toBe(403);
  const platformSecret = await platform.enroll();
  expect(platformSecret).toBeTruthy();
  const createCompany = async (label: string) =>
    platform.expect(
      '/organizations',
      'POST',
      {
        slug: `api-${suffix}-${label}`,
        name: `Companie sintetică ${label}`,
        adminLogin: 'same-admin',
        adminDisplayName: 'Administrator sintetic',
      },
      201,
    );
  const companyA = await createCompany('a');
  const companyB = await createCompany('b');
  expect(companyA.organization.id).not.toBe(companyB.organization.id);
  const primary = new BrowserSession('TENANT');
  const actA = await activate(
    primary,
    'same-admin',
    companyA.temporaryPassword,
    companyA.organization.slug,
  );
  expect(actA.state.stage).toBe('enroll');
  expect((await primary.call('/locations')).status).toBe(403);
  const primarySecret = await primary.enroll();
  const primaryId = (await primary.expect('/auth/session')).user.id;
  const primaryB = new BrowserSession('TENANT');
  const actB = await activate(
    primaryB,
    'same-admin',
    companyB.temporaryPassword,
    companyB.organization.slug,
  );
  expect(actB.state.stage).toBe('enroll');
  await primaryB.enroll();
  expect((await primaryB.expect('/context')).organization.id).toBe(companyB.organization.id);
  const locA = (await primary.expect('/locations', 'POST', { name: 'Locație A', code: 'LOC_A' }))
    .location;
  const locB = (await primary.expect('/locations', 'POST', { name: 'Locație B', code: 'LOC_B' }))
    .location;
  const foreign = (
    await primaryB.expect('/locations', 'POST', { name: 'Locație străină', code: 'OTHER_A' })
  ).location;
  await primaryB.expect('/locations', 'POST', { name: 'Altă locație străină', code: 'OTHER_B' });
  expect(
    (
      await primary.call(`/locations/${foreign.id}`, 'PATCH', {
        name: 'Modificare interzisă',
        version: 1,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await primary.call('/locations', 'POST', {
        name: 'Payload străin',
        code: 'CROSS',
        organizationId: companyB.organization.id,
      })
    ).status,
  ).toBe(400);
  expect((await primary.expect('/locations')).locations.map((l: any) => l.id)).toEqual(
    expect.arrayContaining([locA.id, locB.id]),
  );
  expect((await primary.expect('/locations')).locations.some((l: any) => l.id === foreign.id)).toBe(
    false,
  );
  const workerPermissions = ['orders.read', 'orders.create', 'kitchen.read'].map((permission) => ({
    permission,
  }));
  const workerRole = (
    await primary.expect('/roles', 'POST', {
      name: `Chelner ${suffix}`,
      permissions: workerPermissions,
    })
  ).role;
  const future = await primary.expect('/access/preview', 'POST', {
    scopeType: 'LOCATION',
    locationId: locA.id,
    permissions: workerPermissions,
  });
  expect(future.entries.find((p: any) => p.permission === 'orders.read')).toMatchObject({
    canUse: false,
    proposedCanUse: true,
    canGrant: true,
  });
  const adminRole = (
    await primary.expect('/roles', 'POST', {
      name: `Administrator local ${suffix}`,
      permissions: [
        ...workerPermissions,
        ...[
          'staff.read',
          'staff.create',
          'staff.manage',
          'staff.credentials.reset',
          'staff.access',
          'roles.read',
          'audit.read',
        ].map((permission) => ({ permission })),
      ],
    })
  ).role;
  const refundRole = (
    await primary.expect('/roles', 'POST', {
      name: `Retur restricționat ${suffix}`,
      permissions: [{ permission: 'payments.refund' }],
    })
  ).role;
  const anaResult = await primary.expect('/staff', 'POST', {
    login: `ana-${suffix}`,
    displayName: 'Ana sintetică',
    locationIds: [locA.id],
    assignments: [
      { roleVersionId: adminRole.versions[0].id, scopeType: 'LOCATION', locationId: locA.id },
    ],
  });
  const anaId = anaResult.user.id;
  const grant = (
    await primary.expect('/delegations', 'POST', {
      userId: anaId,
      scopeType: 'LOCATION',
      locationId: locA.id,
      permissions: workerPermissions,
    })
  ).grant;
  const ana = new BrowserSession('TENANT');
  const activatedAna = await activate(
    ana,
    `ana-${suffix}`,
    anaResult.temporaryPassword,
    companyA.organization.slug,
  );
  expect(activatedAna.state.stage).toBe('enroll');
  const anaSecret = await ana.enroll();
  const anaContext = await ana.expect('/context');
  expect(anaContext.locations.map((l: any) => l.id)).toEqual([locA.id]);
  expect(
    anaContext.permissions.find(
      (p: any) => p.permission === 'staff.create' && p.scopeType === 'ORGANIZATION',
    ).canUse,
  ).toBe(false);
  const preview = await ana.expect('/access/preview', 'POST', {
    scopeType: 'LOCATION',
    locationId: locA.id,
  });
  expect(preview.entries.find((p: any) => p.permission === 'orders.read').canUse).toBe(true);
  expect(preview.entries.find((p: any) => p.permission === 'payments.refund').canUse).toBe(false);
  expect((await ana.call(`/staff/${primaryId}/reset-password`, 'POST', {})).status).toBe(403);
  expect(
    (await ana.call(`/staff/${anaId}`, 'PATCH', { version: 1, isPrimaryAdmin: true })).status,
  ).toBe(400);
  expect(
    (
      await ana.call('/delegations', 'POST', {
        userId: anaId,
        scopeType: 'LOCATION',
        locationId: locA.id,
        permissions: workerPermissions,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await ana.call('/staff', 'POST', {
        login: `cross-${suffix}`,
        displayName: 'Respins',
        locationIds: [locB.id],
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await ana.call('/staff', 'POST', {
        login: `refund-${suffix}`,
        displayName: 'Respins',
        locationIds: [locA.id],
        assignments: [
          {
            roleVersionId: refundRole.versions[0].id,
            scopeType: 'LOCATION',
            locationId: locA.id,
          },
        ],
      })
    ).status,
  ).toBe(403);
  return {
    suffix,
    platform,
    companyA,
    primary,
    actA,
    primarySecret,
    primaryId,
    primaryB,
    locA,
    locB,
    workerPermissions,
    workerRole,
    grant,
    ana,
    activatedAna,
    anaSecret,
    preview,
  };
}
