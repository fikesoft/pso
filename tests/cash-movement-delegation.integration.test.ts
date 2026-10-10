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

it('numerar și raport: revocarea provenienței refuză efecte, replay, resolver și paginile raportului', async () => {
  const primary = f.a.primary;
  const locationId = f.a.location.id;
  const permissions = [
    'cash.registers.read',
    'cash.shifts.read',
    'cash.shifts.open',
    'cash.shifts.close',
    'cash.movements.create',
    'cash.reports.read',
  ].map((permission) => ({ permission }));
  const { role: workerRole } = await primary.expect('/roles', 'POST', {
    name: 'Numerar derivat',
    permissions,
  });
  const { role: managerRole } = await primary.expect('/roles', 'POST', {
    name: 'Delegator numerar',
    permissions: [...permissions, { permission: 'staff.create' }, { permission: 'staff.read' }],
  });
  const delegate = await primary.expect('/staff', 'POST', {
    login: 'drawer-delegate',
    displayName: 'Delegator numerar',
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
    code: 'DERIVED',
    name: 'Casă derivată',
  });
  const manager = new BrowserSession('TENANT');
  await activate(
    manager,
    'drawer-delegate',
    delegate.temporaryPassword,
    f.a.company.organization.slug,
  );
  await manager.enroll();
  const worker = await manager.expect('/staff', 'POST', {
    login: 'drawer-derived',
    displayName: 'Operator numerar derivat',
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
  const { shift } = await actor.expect(`/cash-registers/${register.id}/open`, 'POST', {
    locationId,
    requestKey: randomUUID(),
    openingAmount: '0',
  });
  const body = {
    locationId,
    version: 1,
    requestKey: randomUUID(),
    direction: 'IN',
    amount: '10',
    reason: 'Numerar autorizat prin proveniență',
  };
  const path = `/cash-shifts/${shift.id}/movements`;
  const saved = await actor.expect(path, 'POST', body);
  const command = { locationId, shiftId: shift.id, kind: 'CASH_IN', requestKey: body.requestKey };
  const closed = await actor.expect(`/cash-shifts/${shift.id}/close`, 'POST', {
    locationId,
    version: 2,
    requestKey: randomUUID(),
    countedCash: '10',
  });
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Chisinau' }).format(
    new Date(closed.closing.closedAt),
  );
  const query = new URLSearchParams({ locationId, closedFrom: date, closedTo: date });
  expect((await actor.expect(`/cash-shifts/discrepancies?${query}`)).closings).toHaveLength(1);
  await primary.login('admin', f.a.password, f.a.company.organization.slug);
  await primary.expect('/auth/mfa/verify', 'POST', { code: totp(f.a.secret) });
  await primary.expect(`/delegations/${grant.id}/revoke`, 'POST', {
    reason: 'Retragerea drepturilor de numerar delegate',
  });
  expect((await actor.call(`/cash-shifts/${shift.id}?locationId=${locationId}`)).status).toBe(401);
  await login();
  expect((await actor.call(path, 'POST', body)).status).toBe(403);
  expect((await actor.call('/cash-movement-commands/resolution', 'POST', command)).status).toBe(
    403,
  );
  expect((await actor.call(`/cash-shifts/discrepancies?${query}`)).status).toBe(403);
  expect((await actor.call(`/cash-shifts/discrepancy-registers?${query}`)).status).toBe(403);
  expect(
    (await primary.expect(`${path}?locationId=${locationId}`)).movements.find(
      (row: { id: string }) => row.id === saved.movement.id,
    ),
  ).toMatchObject({ amount: '10.00', reason: body.reason });
});
