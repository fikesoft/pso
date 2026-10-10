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

it('responsabilitate delegată: proveniența retrasă refuză ASSIGN/replay/resolver fără a pierde snapshotul', async () => {
  const primary = f.a.primary;
  const locationId = f.a.location.id;
  const permissions = [
    'orders.read',
    'orders.handoff',
    'cash.registers.read',
    'cash.shifts.read',
    'cash.shifts.open',
  ].map((permission) => ({ permission }));
  const { role: workerRole } = await primary.expect('/roles', 'POST', {
    name: 'Asumare derivată',
    permissions,
  });
  const { role: managerRole } = await primary.expect('/roles', 'POST', {
    name: 'Delegator asumare',
    permissions: [...permissions, { permission: 'staff.create' }, { permission: 'staff.read' }],
  });
  const delegate = await primary.expect('/staff', 'POST', {
    login: 'handoff-delegate',
    displayName: 'Delegator asumare',
    locationIds: [locationId],
    assignments: [{ roleVersionId: managerRole.versions[0].id, scopeType: 'LOCATION', locationId }],
  });
  const { grant } = await primary.expect('/delegations', 'POST', {
    userId: delegate.user.id,
    scopeType: 'LOCATION',
    locationId,
    permissions,
  });
  const manager = new BrowserSession('TENANT');
  await activate(
    manager,
    'handoff-delegate',
    delegate.temporaryPassword,
    f.a.company.organization.slug,
  );
  await manager.enroll();
  const worker = await manager.expect('/staff', 'POST', {
    login: 'handoff-derived',
    displayName: 'Operator derivat',
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
  await primary.login('admin', f.a.password, f.a.company.organization.slug);
  await primary.expect('/auth/mfa/verify', 'POST', { code: totp(f.a.secret) });
  const { register } = await primary.expect('/cash-registers', 'POST', {
    locationId,
    requestKey: randomUUID(),
    code: 'HANDOFF',
    name: 'Asumare delegată',
  });
  const { shift } = await actor.expect(`/cash-registers/${register.id}/open`, 'POST', {
    locationId,
    requestKey: randomUUID(),
    openingAmount: '0',
  });
  const { product } = await primary.expect('/catalog/products', 'POST', {
    locationId,
    name: 'Produs pentru asumare',
    sku: randomUUID(),
    price: '10',
  });
  const created = await primary.expect('/orders', 'POST', {
    locationId,
    requestKey: randomUUID(),
    serviceType: 'PICKUP',
    items: [{ productId: product.id, quantity: '1' }],
  });
  const { order } = await primary.expect(`/orders/${created.order.id}/confirm`, 'POST', {
    version: created.order.version,
    requestKey: randomUUID(),
  });
  const body = {
    locationId,
    requestKey: randomUUID(),
    kind: 'ASSIGN',
    targetShiftId: shift.id,
    orderVersion: order.version,
    responsibilityVersion: 0,
    reason: 'Asumare cu proveniență explicită',
  };
  const path = `/orders/${order.id}/responsibility-commands`;
  const saved = await actor.expect(path, 'POST', body);
  const command = {
    locationId,
    requestKey: body.requestKey,
    kind: 'ASSIGN',
    targetShiftId: shift.id,
  };
  await primary.expect(`/delegations/${grant.id}/revoke`, 'POST', {
    reason: 'Retragerea drepturilor de asumare delegate',
  });
  expect((await actor.call('/context')).status).toBe(401);
  await login();
  expect((await actor.call(path, 'POST', body)).status).toBe(403);
  expect((await actor.call(`${path}/resolution`, 'POST', command)).status).toBe(403);
  const history = await primary.expect(
    `/orders/${order.id}/responsibility-events?locationId=${locationId}`,
  );
  expect(history.events).toHaveLength(1);
  expect(history.events[0].eventId).toBe(saved.event.eventId);
});
