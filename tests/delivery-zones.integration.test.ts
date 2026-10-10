import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
import { BrowserSession, fixturePasswords, noSecrets, activate, totp } from './api/support/harness';
import { deliveryZoneProfile } from '../packages/db/test/fixtures/delivery-zone.fixture';
let f: Awaited<ReturnType<typeof prepareOperations>>;
beforeAll(async () => {
  f = await prepareOperations();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
const path = (id: string) => `/delivery-zones/${id}/commands`;
const create = (requestKey = randomUUID()) => ({
  action: 'CREATE',
  requestKey,
  locationId: f.a.location.id,
  profile: deliveryZoneProfile(),
});

it('zone: ciclu complet, replay istoric, rezultat curent și retragere definitivă', async () => {
  const id = randomUUID(),
    body = create();
  const created = await f.a.primary.expect(path(id), 'POST', body);
  expect(created.zone).toMatchObject({ id, version: 1, status: 'ACTIVE', profile: body.profile });
  expect(await f.a.primary.expect(path(id), 'POST', body)).toEqual(created);
  const edit = {
    action: 'UPDATE',
    requestKey: randomUUID(),
    locationId: body.locationId,
    version: 1,
    profile: { ...body.profile, name: 'Nord sintetic', deliveryFee: '30.00' },
  };
  const updated = await f.a.primary.expect(path(id), 'POST', edit);
  expect(updated.zone.version).toBe(2);
  const archived = await f.a.primary.expect(path(id), 'POST', {
    action: 'ARCHIVE',
    requestKey: randomUUID(),
    locationId: body.locationId,
    version: 2,
  });
  expect(archived.zone.status).toBe('ARCHIVED');
  const historical = await f.a.primary.expect(path(id), 'POST', edit);
  expect(historical.result).toEqual(updated.result);
  expect(historical.zone).toEqual(archived.zone);
  const resolved = await f.a.primary.expect(`${path(id)}/resolution`, 'POST', {
    action: 'UPDATE',
    requestKey: edit.requestKey,
    locationId: body.locationId,
  });
  expect(resolved).toMatchObject({ status: 'SUCCEEDED', ...historical });
  expect(
    (await f.a.primary.call(path(id), 'POST', { ...edit, requestKey: randomUUID() })).status,
  ).toBe(409);
  expect(
    (
      await f.a.primary.call(path(id), 'POST', {
        ...body,
        profile: { ...body.profile, name: 'Altă intenție' },
      })
    ).status,
  ).toBe(409);
  const restore = await f.a.primary.expect(path(id), 'POST', {
    action: 'RESTORE',
    requestKey: randomUUID(),
    locationId: body.locationId,
    version: 3,
  });
  expect(restore.zone).toMatchObject({ version: 4, status: 'ACTIVE' });
  const unknown = randomUUID(),
    intent = create();
  const retired = await f.a.primary.expect(`${path(unknown)}/resolution`, 'POST', {
    locationId: intent.locationId,
    requestKey: intent.requestKey,
    action: 'CREATE',
  });
  expect(retired.status).toBe('RETIRED');
  expect((await f.a.primary.call(path(unknown), 'POST', intent)).status).toBe(409);
  expect(
    (await f.a.primary.call(`/delivery-zones/${unknown}?locationId=${intent.locationId}`)).status,
  ).toBe(404);
  noSecrets(resolved);
});

it('zone: listă paginată, cursori legați de context, validare strictă și izolare', async () => {
  const ids = [randomUUID(), randomUUID()];
  for (const id of ids) await f.a.primary.expect(path(id), 'POST', create());
  const query = `/delivery-zones?locationId=${f.a.location.id}&limit=1`;
  const first = await f.a.primary.call(query);
  expect(first.headers.get('cache-control')).toBe('no-store');
  expect(first.data.zones).toHaveLength(1);
  expect(first.data.nextCursor).toBeTruthy();
  const next = await f.a.primary.expect(
    `${query}&cursor=${encodeURIComponent(first.data.nextCursor)}`,
  );
  expect(next.zones[0].id).not.toBe(first.data.zones[0].id);
  for (const changed of [`${query}&status=ALL`, query.replace(f.a.location.id, f.otherLocation.id)])
    expect(
      (await f.a.primary.call(`${changed}&cursor=${encodeURIComponent(first.data.nextCursor)}`))
        .status,
    ).toBe(400);
  expect(
    (await f.a.primary.call(`/delivery-zones/${ids[0]}?locationId=${f.otherLocation.id}`)).status,
  ).toBe(404);
  expect(
    (await f.b.primary.call(`/delivery-zones/${ids[0]}?locationId=${f.b.location.id}`)).status,
  ).toBe(404);
  expect((await f.a.primary.call('/delivery-zones?scopeType=ORGANIZATION')).status).toBe(400);
  const invalid = create();
  expect(
    (
      await f.a.primary.call(path(randomUUID()), 'POST', {
        ...invalid,
        profile: { ...invalid.profile, freeDeliveryFrom: '99.99' },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.a.primary.call(path(ids[0]!), 'POST', {
        action: 'UPDATE',
        requestKey: randomUUID(),
        locationId: f.a.location.id,
        version: 1,
        profile: invalid.profile,
      })
    ).status,
  ).toBe(409);
});

it('zone: citire locală distinctă de administrare, DENY și revocare înainte de recuperare', async () => {
  const id = randomUUID(),
    body = create();
  await f.a.primary.expect(path(id), 'POST', body);
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Cititor zone local',
      permissions: [{ permission: 'delivery.zones.read' }],
    })
  ).role;
  const actor = await f.a.primary.expect('/staff', 'POST', {
    login: 'zone-reader',
    displayName: 'Cititor zone',
    authenticationMethod: 'PIN',
    locationIds: [f.a.location.id, f.otherLocation.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
    ],
  });
  fixturePasswords.add(actor.pin);
  const login = async () => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: actor.pin,
    });
    return session;
  };
  const reader = await login();
  const read = `/delivery-zones/${id}?locationId=${f.a.location.id}`;
  const ownerPage = await f.a.primary.expect(
    `/delivery-zones?locationId=${f.a.location.id}&limit=1`,
  );
  expect(
    (
      await reader.call(
        `/delivery-zones?locationId=${f.a.location.id}&cursor=${encodeURIComponent(ownerPage.nextCursor)}`,
      )
    ).status,
  ).toBe(400);

  expect((await reader.expect(read)).zone.id).toBe(id);
  expect((await reader.call(`/delivery-zones?locationId=${f.otherLocation.id}`)).status).toBe(403);
  expect((await reader.call(path(id), 'POST', body)).status).toBe(403);
  expect(
    (
      await reader.call(`${path(id)}/resolution`, 'POST', {
        action: 'CREATE',
        requestKey: body.requestKey,
        locationId: body.locationId,
      })
    ).status,
  ).toBe(403);
  await f.a.primary.expect(`/staff/${actor.user.id}/overrides`, 'POST', {
    permission: 'delivery.zones.read',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  expect((await (await login()).call(read)).status).toBe(403);
});

it('zone: administrarea cere MFA și reevaluează DENY înaintea recuperării unui succes', async () => {
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Administrator zone local',
      permissions: [{ permission: 'delivery.zones.read' }, { permission: 'delivery.zones.manage' }],
    })
  ).role;
  const actor = await f.a.primary.expect('/staff', 'POST', {
    login: 'zone-manager',
    displayName: 'Administrator zone',
    locationIds: [f.a.location.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
    ],
  });
  const manager = new BrowserSession('TENANT');
  const credentials = await activate(
    manager,
    'zone-manager',
    actor.temporaryPassword,
    f.a.company.organization.slug,
  );
  const id = randomUUID(),
    body = create();
  expect((await manager.call(path(id), 'POST', body)).status).toBe(403);
  const secret = await manager.enroll();
  expect((await manager.expect(path(id), 'POST', body)).zone.id).toBe(id);
  await f.a.primary.expect(`/staff/${actor.user.id}/overrides`, 'POST', {
    permission: 'delivery.zones.manage',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  const renewed = new BrowserSession('TENANT');
  const state = await renewed.login(
    'zone-manager',
    credentials.permanent,
    f.a.company.organization.slug,
  );
  if (state.stage === 'mfa')
    await renewed.expect('/auth/mfa/verify', 'POST', { code: totp(secret) });
  expect(
    (await renewed.expect(`/delivery-zones/${id}?locationId=${f.a.location.id}`)).zone.id,
  ).toBe(id);
  expect(
    (
      await renewed.call(`${path(id)}/resolution`, 'POST', {
        action: 'CREATE',
        requestKey: body.requestKey,
        locationId: body.locationId,
      })
    ).status,
  ).toBe(403);
});
