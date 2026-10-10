import { expect } from 'vitest';
import { BrowserSession, activate, fixturePasswords, totp, noSecrets } from './support/harness';
import type { FoundationScenario } from './foundation.types';

export async function verifyFoundationScenario(state: FoundationScenario) {
  const {
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
  } = state;

  const workerResult = await ana.expect('/staff', 'POST', {
    login: `worker-${suffix}`,
    displayName: 'Lucrător sintetic',
    locationIds: [locA.id],
    assignments: [
      { roleVersionId: workerRole.versions[0].id, scopeType: 'LOCATION', locationId: locA.id },
    ],
  });
  const workerId = workerResult.user.id;
  const worker = new BrowserSession('TENANT');
  const activatedWorker = await activate(
    worker,
    `worker-${suffix}`,
    workerResult.temporaryPassword,
    companyA.organization.slug,
  );
  expect(activatedWorker.state.stage).toBe('ready');
  const tenantAsPlatform = new BrowserSession('PLATFORM');
  tenantAsPlatform.cookies.set('pos_platform', worker.cookies.get('pos_tenant')!);
  expect((await tenantAsPlatform.expect('/auth/session')).user).toBeNull();
  expect((await tenantAsPlatform.call('/organizations')).status).toBe(401);
  const workerContext = await worker.expect('/context');
  noSecrets(workerContext);
  expect(workerContext.locations.map((l: any) => l.id)).toEqual([locA.id]);
  expect(
    workerContext.permissions.find(
      (p: any) => p.permission === 'orders.read' && p.locationId === locA.id,
    ).canUse,
  ).toBe(true);
  expect((await worker.call('/staff')).status).toBe(403);
  expect((await worker.call('/audit')).status).toBe(403);
  expect(
    (
      await ana.call(`/staff/${workerId}/overrides`, 'POST', {
        permission: 'reports.cost.read',
        effect: 'ALLOW',
        scopeType: 'LOCATION',
        locationId: locA.id,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await ana.call(`/staff/${workerId}/assignments`, 'POST', {
        roleVersionId: workerRole.versions[0].id,
        scopeType: 'LOCATION',
        locationId: locB.id,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await ana.call(`/roles/${workerRole.id}/versions`, 'POST', {
        permissions: [{ permission: 'payments.refund' }],
      })
    ).status,
  ).toBe(403);
  // Ana's access mutation invalidates other tenant sessions, including the old primary session.
  const oldPrimary = await primary.expect('/auth/session');
  expect(oldPrimary.user).toBeNull();
  const loginAgain = await primary.login('same-admin', actA.permanent, companyA.organization.slug);
  expect(loginAgain.stage).toBe('mfa');
  expect((await primary.call('/context')).status).toBe(403);
  expect(
    (await primary.call('/auth/mfa/verify', 'POST', { code: primary.lastEnrollmentCode })).status,
  ).toBe(401);
  await primary.expect('/auth/mfa/verify', 'POST', { code: totp(primarySecret) });
  const rolesBefore = await primary.expect('/roles');
  const priorVersion = rolesBefore.roles.find((r: any) => r.id === workerRole.id).versions[0];
  const evolved = await primary.expect(`/roles/${workerRole.id}/versions`, 'POST', {
    permissions: [...workerPermissions, { permission: 'payments.refund' }],
  });
  expect(evolved.version.id).not.toBe(priorVersion.id);
  const current = await worker.expect('/context');
  expect(
    current.permissions.find(
      (p: any) => p.permission === 'payments.refund' && p.locationId === locA.id,
    ).canUse,
  ).toBe(false);
  const deniedFuture = await primary.expect('/access/preview', 'POST', {
    userId: workerId,
    scopeType: 'ORGANIZATION',
    permissions: [{ permission: 'orders.read' }],
    effect: 'DENY',
  });
  expect(deniedFuture.entries.find((p: any) => p.permission === 'orders.read').proposedCanUse).toBe(
    false,
  );
  const deny = (
    await primary.expect(`/staff/${workerId}/overrides`, 'POST', {
      permission: 'orders.read',
      effect: 'DENY',
      scopeType: 'ORGANIZATION',
    })
  ).override;
  expect((await worker.call('/context')).status).toBe(401);
  await worker.login(`worker-${suffix}`, activatedWorker.permanent, companyA.organization.slug);
  const afterDeny = await worker.expect('/context');
  expect(
    afterDeny.permissions.find(
      (p: any) => p.permission === 'orders.read' && p.locationId === locA.id,
    ).canUse,
  ).toBe(false);
  expect(
    afterDeny.permissions.find(
      (p: any) => p.permission === 'orders.create' && p.locationId === locA.id,
    ).canUse,
  ).toBe(true);
  await ana.login(`ana-${suffix}`, activatedAna.permanent, companyA.organization.slug);
  await ana.expect('/auth/mfa/verify', 'POST', { code: totp(anaSecret) });
  expect((await ana.call(`/staff/${workerId}/overrides/${deny.id}`, 'DELETE', {})).status).toBe(
    403,
  );
  expect(
    (
      await ana.call(`/staff/${workerId}/assignments`, 'POST', {
        roleVersionId: evolved.version.id,
        scopeType: 'LOCATION',
        locationId: locA.id,
      })
    ).status,
  ).toBe(403);
  const auditBefore = await primary.expect('/audit');
  noSecrets(auditBefore);
  expect(auditBefore.events.some((e: any) => e.action === 'staff.created')).toBe(true);
  await primary.expect(`/delegations/${grant.id}/revoke`, 'POST', {
    reason: 'Retragere sintetică pentru verificare',
  });
  expect((await worker.call('/context')).status).toBe(401);
  await worker.login(`worker-${suffix}`, activatedWorker.permanent, companyA.organization.slug);
  const afterRevoke = await worker.expect('/context');
  expect(
    afterRevoke.permissions.find(
      (p: any) => p.permission === 'orders.create' && p.locationId === locA.id,
    ).canUse,
  ).toBe(false);
  const oldWorker = worker.clone();
  const reset = await primary.expect(`/staff/${workerId}/reset-password`, 'POST', {});
  fixturePasswords.add(reset.temporaryPassword);
  expect((await oldWorker.expect('/auth/session')).user).toBeNull();
  expect(
    (
      await worker.call('/auth/login', 'POST', {
        companySlug: companyA.organization.slug,
        login: `worker-${suffix}`,
        password: activatedWorker.permanent,
      })
    ).status,
  ).toBe(401);
  const resetState = await worker.login(
    `worker-${suffix}`,
    reset.temporaryPassword,
    companyA.organization.slug,
  );
  expect(resetState.stage).toBe('password');
  expect((await worker.call('/context')).status).toBe(403);
  const users = await primary.expect('/staff');
  noSecrets(users);
  expect(users.users.some((u: any) => u.login === `refund-${suffix}`)).toBe(false);
  const target = users.users.find((u: any) => u.id === workerId);
  await primary.expect(`/staff/${workerId}`, 'PATCH', {
    status: 'DISABLED',
    version: target.version,
  });
  expect((await worker.expect('/auth/session')).user).toBeNull();
  expect(
    (await primary.call(`/staff/${primaryId}`, 'PATCH', { status: 'DISABLED', version: 1 })).status,
  ).toBe(403);
  const bStaff = await primaryB.expect('/staff');
  expect(bStaff.users.some((u: any) => u.id === workerId)).toBe(false);
  noSecrets(await platform.expect('/organizations'));
  noSecrets(await primary.expect('/audit'));
  await primary.expect('/auth/logout', 'POST', {});
  expect((await primary.expect('/auth/session')).user).toBeNull();
}
