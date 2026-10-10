import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareRegisterTenants } from './api/cash-registers-tenants';
import { closeOperations } from './api/operations-setup';
import { activate, BrowserSession, fixturePasswords, totp } from './api/support/harness';

let f: Awaited<ReturnType<typeof prepareRegisterTenants>>;
beforeAll(async () => {
  f = await prepareRegisterTenants();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('ture: retragerea delegării elimină OPEN și rezoluția derivată, inclusiv replay-ul confirmat', async () => {
  const primary = f.a.primary;
  const locationId = f.a.location.id;
  const permissions = ['cash.registers.read', 'cash.shifts.read', 'cash.shifts.open'].map(
    (permission) => ({ permission }),
  );
  const { role: workerRole } = await primary.expect('/roles', 'POST', {
    name: 'Ture derivate',
    permissions,
  });
  const { role: managerRole } = await primary.expect('/roles', 'POST', {
    name: 'Delegator ture',
    permissions: [...permissions, { permission: 'staff.create' }, { permission: 'staff.read' }],
  });
  const delegate = await primary.expect('/staff', 'POST', {
    login: 'shift-delegate',
    displayName: 'Delegator ture',
    locationIds: [locationId],
    assignments: [{ roleVersionId: managerRole.versions[0].id, scopeType: 'LOCATION', locationId }],
  });
  const { grant } = await primary.expect('/delegations', 'POST', {
    userId: delegate.user.id,
    scopeType: 'LOCATION',
    locationId,
    permissions,
  });
  const { register } = await primary.expect('/cash-registers', 'POST', {
    locationId,
    requestKey: randomUUID(),
    code: 'DELEGATED',
    name: 'Casă pentru proveniență',
  });
  const manager = new BrowserSession('TENANT');
  await activate(
    manager,
    'shift-delegate',
    delegate.temporaryPassword,
    f.a.company.organization.slug,
  );
  await manager.enroll();
  const worker = await manager.expect('/staff', 'POST', {
    login: 'shift-derived',
    displayName: 'Casier derivat',
    authenticationMethod: 'PIN',
    locationIds: [locationId],
    assignments: [{ roleVersionId: workerRole.versions[0].id, scopeType: 'LOCATION', locationId }],
  });
  fixturePasswords.add(worker.pin);
  const actor = new BrowserSession('TENANT');
  const login = async () => {
    await actor.expect('/auth/session');
    await actor.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: worker.pin,
    });
  };
  await login();
  const body = { locationId, requestKey: randomUUID(), openingAmount: '0' };
  const opened = await actor.expect(`/cash-registers/${register.id}/open`, 'POST', body);
  const command = {
    locationId,
    requestKey: body.requestKey,
    registerId: register.id,
    kind: 'OPEN',
  };
  expect((await actor.expect('/cash-commands/resolution', 'POST', command)).status).toBe(
    'SUCCEEDED',
  );
  await primary.login('admin', f.a.password, f.a.company.organization.slug);
  await primary.expect('/auth/mfa/verify', 'POST', { code: totp(f.a.secret) });
  await primary.expect(`/delegations/${grant.id}/revoke`, 'POST', {
    reason: 'Retragerea drepturilor de tură delegate',
  });
  expect((await actor.call(`/cash-shifts?locationId=${locationId}`)).status).toBe(401);
  await login();
  expect((await actor.call(`/cash-registers/${register.id}/open`, 'POST', body)).status).toBe(403);
  expect((await actor.call('/cash-commands/resolution', 'POST', command)).status).toBe(403);
  expect(
    (await primary.expect(`/cash-shifts/${opened.shift.id}?locationId=${locationId}`)).shift,
  ).toEqual(opened.shift);
});
