import { expect } from 'vitest';
import { activate, BrowserSession, fixturePasswords } from './support/harness';
import type { PinFixture } from './pin.types';

export async function verifyPinResetScope(f: PinFixture) {
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Administrator fără resetare',
      permissions: [{ permission: 'staff.create' }],
    })
  ).role;
  const delegated = await f.a.primary.expect('/staff', 'POST', {
    login: 'pin-no-reset',
    displayName: 'Administrator fără resetare',
    locationIds: [f.a.location.id],
    assignments: [
      {
        roleVersionId: role.versions[0].id,
        scopeType: 'LOCATION',
        locationId: f.a.location.id,
      },
    ],
  });
  const worker = await f.a.primary.expect('/staff', 'POST', {
    login: 'pin-managed-worker',
    displayName: 'Lucrător subordonat',
    authenticationMethod: 'PIN',
    managedByUserId: delegated.user.id,
    locationIds: [f.a.location.id],
  });
  fixturePasswords.add(worker.pin);
  const admin = new BrowserSession('TENANT');
  await activate(admin, 'pin-no-reset', delegated.temporaryPassword, f.a.company.organization.slug);
  await admin.enroll();
  // The management relationship is valid; reset still requires its own permission.
  const staff = (await admin.expect('/staff')).users;
  expect(staff.some((entry: any) => entry.id === worker.user.id)).toBe(true);
  expect((await admin.call(`/staff/${worker.user.id}/reset-pin`, 'POST', {})).status).toBe(403);
  expect((await f.b.primary.call(`/staff/${worker.user.id}/reset-pin`, 'POST', {})).status).toBe(
    403,
  );
  const signed = await f.login(worker.pin);
  expect((await signed.session.call(`/staff/${worker.user.id}/reset-pin`, 'POST', {})).status).toBe(
    403,
  );
  expect(
    (await signed.session.call(`/staff/${delegated.user.id}/reset-pin`, 'POST', {})).status,
  ).toBe(403);
  const wrongCompany = new BrowserSession('TENANT');
  await wrongCompany.expect('/auth/session');
  expect(
    (
      await wrongCompany.call('/auth/pin', 'POST', {
        companySlug: f.b.company.organization.slug,
        pin: worker.pin,
      })
    ).status,
  ).toBe(401);
  await signed.session.expect('/context');
}
