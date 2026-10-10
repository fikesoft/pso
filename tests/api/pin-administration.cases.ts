import { expect } from 'vitest';
import { BrowserSession, activate, noSecrets } from './support/harness';
import type { PinFixture } from './pin.types';

export async function verifyAdministrativePinRejection(f: PinFixture) {
  const adminId = (await f.a.primary.expect('/auth/session')).user.id;
  expect((await f.a.primary.call(`/staff/${adminId}/reset-pin`, 'POST', {})).status).toBe(403);
  const prior = await f.a.primary.expect('/staff');
  expect(
    (
      await f.a.primary.call('/staff', 'POST', {
        login: 'forbidden-pin-admin',
        displayName: 'Administrator',
        authenticationMethod: 'PIN',
        locationIds: [f.a.location.id],
        assignments: [
          {
            roleVersionId: f.administrativeRole.versions[0].id,
            scopeType: 'LOCATION',
            locationId: f.a.location.id,
          },
        ],
      })
    ).status,
  ).toBe(403);
  expect((await f.a.primary.expect('/staff')).users.length).toBe(prior.users.length);
  const worker = await f.create('pin-promoted');
  const signed = await f.login(worker.pin);
  await f.a.primary.expect(`/staff/${worker.user.id}/assignments`, 'POST', {
    roleVersionId: f.administrativeRole.versions[0].id,
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  expect((await signed.session.call('/context')).status).toBe(401);
  const rejected = new BrowserSession('TENANT');
  await rejected.expect('/auth/session');
  expect(
    (
      await rejected.call('/auth/pin', 'POST', {
        companySlug: f.a.company.organization.slug,
        pin: worker.pin,
      })
    ).status,
  ).toBe(401);
  expect((await f.a.primary.call(`/staff/${worker.user.id}/reset-pin`, 'POST', {})).status).toBe(
    403,
  );
  const reset = await f.a.primary.expect(`/staff/${worker.user.id}/reset-password`, 'POST', {});
  const admin = new BrowserSession('TENANT');
  const activated = await activate(
    admin,
    'pin-promoted',
    reset.temporaryPassword,
    f.a.company.organization.slug,
  );
  expect(activated.state.stage).toBe('enroll');
  expect((await admin.call('/context')).status).toBe(403);
  await admin.enroll();
  await admin.expect('/context');
  const record = (await f.a.primary.expect('/staff')).users.find(
    (u: any) => u.id === worker.user.id,
  );
  expect(record).toMatchObject({ authenticationMethod: 'PASSWORD', mfaRequired: true });
  noSecrets(record);
}

export async function verifyPinRequestGuards(f: PinFixture) {
  const caller = new BrowserSession('TENANT');
  await caller.expect('/auth/session');
  const body = { companySlug: f.a.company.organization.slug, pin: 'UNKNOWN12345' };
  expect(
    (await caller.call('/auth/pin', 'POST', body, { origin: 'https://invalid.example' })).status,
  ).toBe(403);
  expect((await caller.call('/auth/pin', 'POST', body, {}, false)).status).toBe(403);
  expect((await caller.call('/auth/pin', 'POST', { ...body, pin: '123' })).status).toBe(400);
  expect(
    (
      await caller.call('/auth/pin', 'POST', {
        ...body,
        userId: f.a.company.organization.primaryAdminUserId,
      })
    ).status,
  ).toBe(400);
  const responses = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    responses.push(
      (await caller.call('/auth/pin', 'POST', { ...body, pin: 'BRUTE123456' })).status,
    );
  }
  expect(responses).toContain(429);
}
