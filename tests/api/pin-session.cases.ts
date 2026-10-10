import { expect } from 'vitest';
import { activate, BrowserSession, db } from './support/harness';
import type { PinFixture } from './pin.types';

export async function verifyPinSessionLifecycle(f: PinFixture) {
  const worker = await f.create('pin-to-password');
  const first = await f.login(worker.pin);
  const copied = first.session.clone();
  await first.session.expect('/auth/logout', 'POST', {});
  expect((await copied.call('/context')).status).toBe(401);
  const active = await f.login(worker.pin);
  const reset = await f.a.primary.expect(`/staff/${worker.user.id}/reset-password`, 'POST', {});
  expect((await active.session.call('/context')).status).toBe(401);
  const anonymous = new BrowserSession('TENANT');
  await anonymous.expect('/auth/session');
  expect(
    (
      await anonymous.call('/auth/pin', 'POST', {
        companySlug: f.a.company.organization.slug,
        pin: worker.pin,
      })
    ).status,
  ).toBe(401);
  const changed = await activate(
    anonymous,
    'pin-to-password',
    reset.temporaryPassword,
    f.a.company.organization.slug,
  );
  expect(changed.state).toMatchObject({
    stage: 'ready',
    user: { authenticationMethod: 'PASSWORD', mfaRequired: false },
  });
  await anonymous.expect('/context');
}

export async function verifyPinLivePolicy(f: PinFixture) {
  const worker = await f.create('pin-policy-recheck');
  const signed = await f.login(worker.pin);
  const primary = (await f.a.primary.expect('/auth/session')).user;
  // Simulate stale user flags using the restricted runtime role. Authorization must
  // still reject a PIN when actual permissions now require MFA.
  await db.withTenantTransaction(
    db.runtime,
    {
      organizationId: f.a.company.organization.id,
      userId: primary.id,
    },
    async (tx) => {
      await tx.userRoleAssignment.create({
        data: {
          organizationId: f.a.company.organization.id,
          userId: worker.user.id,
          roleVersionId: f.administrativeRole.versions[0].id,
          scopeType: 'LOCATION',
          locationId: f.a.location.id,
          issuedByUserId: primary.id,
        },
      });
      const current = await tx.companyUser.findUniqueOrThrow({ where: { id: worker.user.id } });
      expect(current).toMatchObject({ authenticationMethod: 'PIN', mfaRequired: false });
    },
  );
  expect((await signed.session.call('/context')).status).toBe(401);
  const fresh = new BrowserSession('TENANT');
  await fresh.expect('/auth/session');
  expect(
    (
      await fresh.call('/auth/pin', 'POST', {
        companySlug: f.a.company.organization.slug,
        pin: worker.pin,
      })
    ).status,
  ).toBe(401);
  expect((await f.a.primary.call(`/staff/${worker.user.id}/reset-pin`, 'POST', {})).status).toBe(
    403,
  );
  // Restore consistent flags through the real administrative API after the probe.
  await f.a.primary.expect(`/staff/${worker.user.id}/assignments`, 'POST', {
    roleVersionId: f.administrativeRole.versions[0].id,
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  const users = (await f.a.primary.expect('/staff')).users;
  expect(users.find((entry: any) => entry.id === worker.user.id)).toMatchObject({
    authenticationMethod: 'PASSWORD',
    mfaRequired: true,
    mustChangePassword: true,
  });
}
