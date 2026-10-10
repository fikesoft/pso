import './api/support/harness';
import { createHash, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { prepareFoundationScenario } from './api/foundation-setup';
import { prepareCheckout } from './api/checkout-setup';
import { closeOperations } from './api/operations-setup';
import { activate, BrowserSession, db, noSecrets, totp } from './api/support/harness';

it('profilul păstrează datele HR și restrânge scope-ul, metricile și sesiunile', async () => {
  const f = await prepareFoundationScenario();
  const created = await f.ana.expect('/staff', 'POST', {
    login: `profile-${f.suffix}`,
    displayName: 'Profil sintetic',
    firstName: 'Ana',
    lastName: 'Ionescu',
    phone: '+37360123456',
    email: 'EMPLOYEE@EXAMPLE.TEST',
    employeeCode: `EMP-${f.suffix}`,
    hireDate: '2026-09-01',
    locationIds: [f.locA.id],
    assignments: [
      { roleVersionId: f.workerRole.versions[0].id, scopeType: 'LOCATION', locationId: f.locA.id },
    ],
  });
  const userId = created.user.id as string;
  expect(created.user).toMatchObject({
    id: userId,
    firstName: 'Ana',
    lastName: 'Ionescu',
    email: 'employee@example.test',
    employeeCode: `EMP-${f.suffix}`,
    hireDate: '2026-09-01',
  });
  noSecrets(created.user);
  expect(
    (
      await f.ana.call('/staff', 'POST', {
        login: `duplicate-${f.suffix}`,
        displayName: 'Cod duplicat',
        employeeCode: `EMP-${f.suffix}`,
        locationIds: [f.locA.id],
      })
    ).status,
  ).toBe(409);
  expect((await f.ana.call(`/staff/${userId}/profile?locationId=${f.locB.id}`)).status).toBe(403);
  expect((await f.primaryB.call(`/staff/${userId}/profile`)).status).toBe(404);
  expect((await f.ana.call(`/staff/${userId}/profile?from=2026-02-30`)).status).toBe(400);

  const managerId = (await f.ana.expect('/auth/session')).user.id;
  const foreignLocationUser = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.companyA.organization.id, userId: f.primaryId },
    async (tx) => {
      const target = await tx.companyUser.create({
        data: {
          organizationId: f.companyA.organization.id,
          loginNormalized: `other-location-${f.suffix}`,
          displayName: 'Altă locație',
          passwordHash: '$argon2id$test-fixture-not-a-login-hash',
          createdByUserId: f.primaryId,
          managedByUserId: managerId,
        },
      });
      await tx.userLocationAccess.create({
        data: {
          organizationId: f.companyA.organization.id,
          userId: target.id,
          locationId: f.locB.id,
          isDefault: true,
        },
      });
      return target;
    },
  );
  expect((await f.ana.call(`/staff/${foreignLocationUser.id}/profile`)).status).toBe(403);

  await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.companyA.organization.id, userId },
    async (tx) => {
      const latest = await tx.order.aggregate({
        where: { locationId: f.locA.id },
        _max: { number: true },
      });
      const order = await tx.order.create({
        data: {
          organizationId: f.companyA.organization.id,
          locationId: f.locA.id,
          number: (latest._max.number ?? 0) + 1,
          serviceType: 'DINE_IN',
          total: '0.00',
          clientRequestId: randomUUID(),
          creationRequestHash: createHash('sha256').update(randomUUID()).digest('hex'),
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED', updatedByUserId: userId, version: { increment: 1 } },
      });
      await tx.orderStatusEvent.create({
        data: {
          organizationId: f.companyA.organization.id,
          locationId: f.locA.id,
          orderId: order.id,
          kind: 'ORDER',
          fromStatus: 'DRAFT',
          toStatus: 'CANCELLED',
          actorUserId: userId,
        },
      });
    },
  );
  const managerView = await f.ana.expect(`/staff/${userId}/profile?locationId=${f.locA.id}`);
  expect(managerView.profile.scope.locationIds).toEqual([f.locA.id]);
  expect(managerView.profile.scope.timezone).toBe('Europe/Chisinau');
  expect(managerView.profile.performance).toMatchObject({
    ordersCreated: 1,
    ordersCancelled: 1,
    paymentsHandled: null,
    revenueHandled: null,
    averageOrder: null,
    currency: null,
    refunds: null,
  });
  expect(managerView.profile.sessions).toMatchObject({ count: 0, lastLoginAt: null });
  expect(managerView.profile.attendance).toBeNull();
  noSecrets(managerView);

  const worker = new BrowserSession('TENANT');
  await activate(
    worker,
    `profile-${f.suffix}`,
    created.temporaryPassword,
    f.companyA.organization.slug,
  );
  const self = await worker.expect(`/staff/${userId}/profile`);
  expect(self.profile.user.id).toBe(userId);
  expect(self.profile.sessions.count).toBe(1);
  expect(self.profile.sessions.lastLoginAt).toMatch(/^\d{4}-/);
  expect(self.profile.attendance).toBeNull();
  noSecrets(self);

  const updated = await f.ana.expect(`/staff/${userId}`, 'PATCH', {
    version: created.user.version,
    phone: null,
    hireDate: null,
  });
  expect(updated.user).toMatchObject({ id: userId, phone: null, hireDate: null });
  const disabled = await f.ana.expect(`/staff/${userId}`, 'PATCH', {
    version: updated.user.version,
    status: 'DISABLED',
  });
  expect(disabled.user.status).toBe('DISABLED');
  expect((await worker.call(`/staff/${userId}/profile`)).status).toBe(401);
  await f.primary.login('same-admin', f.actA.permanent, f.companyA.organization.slug);
  await f.primary.expect('/auth/mfa/verify', 'POST', { code: totp(f.primarySecret) });
  const history = await f.primary.expect(`/staff/${userId}/profile`);
  expect(history.profile.user).toMatchObject({
    id: userId,
    status: 'DISABLED',
    phone: null,
    hireDate: null,
  });
  expect(history.profile.performance.revenueHandled).toBe('0.00');
  expect(history.profile.performance.currency).toBe('MDL');
  expect(history.profile.attendance).toMatchObject({ shiftCount: 0, recentShifts: [] });
  noSecrets(history);
});

it('un DENY de locație blochează metricile chiar dacă există ALLOW de organizație', async () => {
  const f = await prepareFoundationScenario();
  const worker = await f.ana.expect('/staff', 'POST', {
    login: `denied-profile-${f.suffix}`,
    displayName: 'Profil cu acces restrâns',
    locationIds: [f.locA.id],
  });
  const managerId = (await f.ana.expect('/auth/session')).user.id;
  await f.primary.expect(`/staff/${managerId}/overrides`, 'POST', {
    permission: 'reports.sales.read',
    effect: 'ALLOW',
    scopeType: 'ORGANIZATION',
  });
  await f.primary.expect(`/staff/${managerId}/overrides`, 'POST', {
    permission: 'reports.sales.read',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.locA.id,
  });
  await f.ana.login(`ana-${f.suffix}`, f.activatedAna.permanent, f.companyA.organization.slug);
  await f.ana.expect('/auth/mfa/verify', 'POST', { code: totp(f.anaSecret) });
  const context = await f.ana.expect('/context');
  expect(
    context.permissions.find(
      (item: any) => item.permission === 'reports.sales.read' && item.scopeType === 'ORGANIZATION',
    ).canUse,
  ).toBe(true);
  expect(
    context.permissions.find(
      (item: any) =>
        item.permission === 'reports.sales.read' &&
        item.scopeType === 'LOCATION' &&
        item.locationId === f.locA.id,
    ).canUse,
  ).toBe(false);
  const profile = await f.ana.expect(`/staff/${worker.user.id}/profile?locationId=${f.locA.id}`);
  expect(profile.profile.performance).toMatchObject({
    paymentsHandled: null,
    revenueHandled: null,
    averageOrder: null,
    currency: null,
  });
  expect(profile.profile.attendance).toBeNull();
});

it('media comenzii exclude DEMO, iar încasările apar doar cu drept de raportare', async () => {
  const f = await prepareCheckout();
  try {
    const paidOrder = await f.makeOrder();
    const cashier = await f.login('cashier');
    await cashier.expect(`/orders/${paidOrder.id}/checkout/manual`, 'POST', {
      version: paidOrder.version,
      requestKey: randomUUID(),
      method: 'CASH',
      receivedAmount: '20.00',
      cashShiftId: (await f.cashShift(cashier)).id,
      confirmed: true,
    });
    const demoOrder = await f.makeOrder();
    await f.a.primary.expect(`/orders/${demoOrder.id}/checkout/demo`, 'POST', {
      version: demoOrder.version,
      requestKey: randomUUID(),
    });
    const ownerId = (await f.a.primary.expect('/auth/session')).user.id;
    const owner = await f.a.primary.expect(
      `/staff/${ownerId}/profile?locationId=${f.a.location.id}`,
    );
    expect(owner.profile.performance).toMatchObject({
      ordersCreated: 2,
      averageOrder: '10.01',
      averageOrderOrders: 1,
      currency: 'MDL',
    });
    const cashierId = f.actors.cashier.user.id;
    const cashierView = await cashier.expect(
      `/staff/${cashierId}/profile?locationId=${f.a.location.id}`,
    );
    expect(cashierView.profile.performance).toMatchObject({
      paymentsHandled: null,
      revenueHandled: null,
      averageOrder: null,
      currency: null,
    });
    const managerView = await f.a.primary.expect(
      `/staff/${cashierId}/profile?locationId=${f.a.location.id}`,
    );
    expect(managerView.profile.performance).toMatchObject({
      paymentsHandled: 1,
      revenueHandled: '10.01',
      currency: 'MDL',
    });
    noSecrets(managerView);
  } finally {
    await closeOperations(f.owner.id);
  }
});
