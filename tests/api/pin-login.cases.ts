import { expect } from 'vitest';
import { BrowserSession, noSecrets, fixturePasswords } from './support/harness';
import type { PinFixture } from './pin.types';

export async function verifyPinLogin(f: PinFixture) {
  const created = await f.create('pin-worker', '6A77FFA33');
  expect(created.pin).toBe('6A77FFA33');
  expect(created).not.toHaveProperty('temporaryPassword');
  expect(created.user).toMatchObject({
    authenticationMethod: 'PIN',
    mustChangePassword: false,
    mfaRequired: false,
  });
  noSecrets(created.user);
  // The same code belongs to a different identity in a different company.
  const other = await f.b.primary.expect('/staff', 'POST', {
    login: 'pin-other',
    displayName: 'Lucrător alt tenant',
    authenticationMethod: 'PIN',
    pin: created.pin,
    locationIds: [f.b.location.id],
  });
  const { session, response } = await f.login(' 6a77ffa33 ');
  expect(response.stage).toBe('ready');
  expect(response.user.id).toBe(created.user.id);
  noSecrets(response);
  const context = await session.expect('/context');
  expect(context.organization.id).toBe(f.a.company.organization.id);
  expect(context.locations.map((l: any) => l.id)).toEqual([f.a.location.id]);
  await session.expect(`/orders?locationId=${f.a.location.id}`);
  expect((await session.call(`/orders?locationId=${f.otherLocation.id}`)).status).toBe(403);
  expect((await session.call('/staff')).status).toBe(403);
  expect((await session.call('/auth/mfa/enroll', 'POST', {})).status).toBe(403);
  expect(
    (
      await session.call('/auth/password', 'POST', {
        currentPassword: created.pin,
        newPassword: 'Should-Not-Activate123!',
      })
    ).status,
  ).toBe(403);
  const b = await f.login(created.pin, f.b.company.organization.slug);
  expect(b.response.user.id).toBe(other.user.id);
  expect((await b.session.call(`/orders?locationId=${f.a.location.id}`)).status).toBe(403);
  const unknown = new BrowserSession('TENANT');
  await unknown.expect('/auth/session');
  const wrong = await unknown.call('/auth/pin', 'POST', {
    companySlug: f.a.company.organization.slug,
    pin: 'UNKNOWN12345',
  });
  const wrongTenant = await unknown.call('/auth/pin', 'POST', {
    companySlug: 'missing-tenant',
    pin: created.pin,
  });
  expect(wrong.status).toBe(401);
  expect(wrongTenant).toMatchObject({ status: 401, data: wrong.data });
  expect(
    (
      await unknown.call('/auth/login', 'POST', {
        companySlug: f.a.company.organization.slug,
        login: 'pin-worker',
        password: created.pin,
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await f.a.primary.call('/staff', 'POST', {
        login: 'duplicate-pin',
        displayName: 'Duplicat',
        authenticationMethod: 'PIN',
        pin: created.pin,
        locationIds: [f.a.location.id],
      })
    ).status,
  ).toBe(409);
  const platform = new BrowserSession('PLATFORM');
  await platform.expect('/auth/session');
  expect(
    (
      await platform.call('/auth/pin', 'POST', {
        companySlug: f.a.company.organization.slug,
        pin: created.pin,
      })
    ).status,
  ).toBe(404);
  const audit = await f.a.primary.expect('/audit');
  noSecrets(audit);
  fixturePasswords.add(other.pin);
}

export async function verifyPinRotation(f: PinFixture) {
  const created = await f.create('pin-rotation');
  const { session } = await f.login(created.pin);
  const reset = await f.a.primary.expect(`/staff/${created.user.id}/reset-pin`, 'POST', {});
  fixturePasswords.add(reset.pin);
  expect(reset.pin).toMatch(/^[A-Z0-9]{9,32}$/);
  expect(reset.pin).not.toBe(created.pin);
  expect((await session.call('/context')).status).toBe(401);
  const old = new BrowserSession('TENANT');
  await old.expect('/auth/session');
  expect(
    (
      await old.call('/auth/pin', 'POST', {
        companySlug: f.a.company.organization.slug,
        pin: created.pin,
      })
    ).status,
  ).toBe(401);
  const fresh = await f.login(reset.pin);
  await fresh.session.expect('/context');
  await f.a.primary.expect(`/staff/${created.user.id}`, 'PATCH', {
    version: reset.user.version,
    status: 'DISABLED',
  });
  expect((await fresh.session.call('/context')).status).toBe(401);
  expect(
    (
      await old.call('/auth/pin', 'POST', {
        companySlug: f.a.company.organization.slug,
        pin: reset.pin,
      })
    ).status,
  ).toBe(401);
  expect((await f.a.primary.call(`/staff/${created.user.id}/reset-pin`, 'POST', {})).status).toBe(
    403,
  );
}
