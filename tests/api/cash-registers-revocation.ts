import { expect } from 'vitest';
import { activate, BrowserSession, totp } from './support/harness';
import type { CashRegistersFixture } from './cash-registers.types';

export async function verifyRegisterRevocation(f: CashRegistersFixture) {
  const primary = f.a.primary;
  const permissions = ['cash.registers.read', 'cash.registers.manage'].map((permission) => ({
    permission,
  }));
  const workerRole = (
    await primary.expect('/roles', 'POST', { name: 'Case derivate', permissions })
  ).role;
  const delegateRole = (
    await primary.expect('/roles', 'POST', {
      name: 'Delegator case',
      permissions: [...permissions, { permission: 'staff.create' }, { permission: 'staff.read' }],
    })
  ).role;
  const locationId = f.a.location.id;
  const delegate = await primary.expect('/staff', 'POST', {
    login: 'register-delegate',
    displayName: 'Delegator case',
    locationIds: [locationId],
    assignments: [
      { roleVersionId: delegateRole.versions[0].id, scopeType: 'LOCATION', locationId },
    ],
  });
  const grant = (
    await primary.expect('/delegations', 'POST', {
      userId: delegate.user.id,
      scopeType: 'LOCATION',
      locationId,
      permissions,
    })
  ).grant;
  const manager = new BrowserSession('TENANT');
  await activate(
    manager,
    'register-delegate',
    delegate.temporaryPassword,
    f.a.company.organization.slug,
  );
  await manager.enroll();
  const derived = await manager.expect('/staff', 'POST', {
    login: 'register-derived',
    displayName: 'Administrator derivat case',
    locationIds: [locationId],
    assignments: [{ roleVersionId: workerRole.versions[0].id, scopeType: 'LOCATION', locationId }],
  });
  const actor = new BrowserSession('TENANT');
  const activation = await activate(
    actor,
    'register-derived',
    derived.temporaryPassword,
    f.a.company.organization.slug,
  );
  const secret = await actor.enroll();
  const body = f.body();
  const created = await actor.expect('/cash-registers', 'POST', body);
  await primary.login('admin', f.a.password, f.a.company.organization.slug);
  await primary.expect('/auth/mfa/verify', 'POST', { code: totp(f.a.secret) });
  await primary.expect(`/delegations/${grant.id}/revoke`, 'POST', {
    reason: 'Retragere delegare case pentru probă',
  });
  expect((await actor.call(`/cash-registers?locationId=${locationId}`)).status).toBe(401);
  await actor.login('register-derived', activation.permanent, f.a.company.organization.slug);
  await actor.expect('/auth/mfa/verify', 'POST', { code: totp(secret) });
  expect((await actor.call('/cash-registers', 'POST', body)).status).toBe(403);
  expect(
    (
      await actor.call('/cash-register-commands/resolution', 'POST', {
        locationId,
        requestKey: body.requestKey,
        kind: 'CREATE',
      })
    ).status,
  ).toBe(403);
  expect(
    (await primary.expect(`/cash-registers/${created.register.id}?locationId=${locationId}`))
      .register,
  ).toEqual(created.register);
}
