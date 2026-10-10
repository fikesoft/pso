import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareCouriers } from './api/courier-setup';
import { closeOperations } from './api/operations-setup';
import { BrowserSession, activate, totp } from './api/support/harness';
let f: Awaited<ReturnType<typeof prepareCouriers>>;
let ownId: string;
beforeAll(async () => {
  f = await prepareCouriers();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
const path = (id: string) => `/couriers/${id}/commands`;
const read = (id: string) => `/couriers/${id}?locationId=${f.a.location.id}`;
it('curier: profil local, replay istoric, pauză/arhivare/restaurare și cheie retrasă', async () => {
  ownId = randomUUID();
  const body = f.body();
  const created = await f.a.primary.expect(path(ownId), 'POST', body);
  expect(created.courier).toMatchObject({
    userId: f.own.user.id,
    version: 1,
    availability: 'OFFLINE',
    effectiveStatus: 'OFFLINE',
  });
  expect((await f.a.primary.call(path(randomUUID()), 'POST', f.body())).status).toBe(409);
  const updated = await f.a.primary.expect(path(ownId), 'POST', {
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    action: 'UPDATE',
    version: 1,
    profile: { vehicle: 'CAR', capacity: 2 },
  });
  expect(updated.courier.profile.capacity).toBe(2);
  const replay = await f.a.primary.expect(path(ownId), 'POST', body);
  expect(replay.result.version).toBe(1);
  expect(replay.courier.version).toBe(2);
  expect(
    (
      await f.a.primary.call(path(ownId), 'POST', {
        ...body,
        profile: { vehicle: 'CAR', capacity: 3 },
      })
    ).status,
  ).toBe(409);
  for (const [index, action] of ['ARCHIVE', 'RESTORE'].entries()) {
    const result = await f.a.primary.expect(path(ownId), 'POST', {
      action,
      locationId: f.a.location.id,
      requestKey: randomUUID(),
      version: index + 2,
    });
    expect(result.courier).toMatchObject({
      status: action === 'ARCHIVE' ? 'ARCHIVED' : 'ACTIVE',
      availability: 'OFFLINE',
    });
  }
  const retiredId = randomUUID(),
    retired = f.body(f.third.user.id);
  expect(
    (
      await f.a.primary.expect(`${path(retiredId)}/resolution`, 'POST', {
        action: 'CREATE',
        locationId: retired.locationId,
        requestKey: retired.requestKey,
      })
    ).status,
  ).toBe('RETIRED');
  expect((await f.a.primary.call(path(retiredId), 'POST', retired)).status).toBe(409);
});
it('curier: propria disponibilitate nu conferă roster, administrare sau acces la altă locație', async () => {
  const own = await f.login(),
    reader = await f.login(f.reader);
  expect((await own.expect(`/couriers/me?locationId=${f.a.location.id}`)).courier.id).toBe(ownId);
  expect((await own.call(`/couriers?locationId=${f.a.location.id}`)).status).toBe(403);
  expect((await own.call(`/couriers/candidates?locationId=${f.a.location.id}`)).status).toBe(403);
  expect((await own.call(`/couriers/me?locationId=${f.otherLocation.id}`)).status).toBe(403);
  expect((await reader.expect(read(ownId))).courier.id).toBe(ownId);
  expect(
    (
      await reader.call(path(ownId), 'POST', {
        locationId: f.a.location.id,
        requestKey: randomUUID(),
        action: 'SET_AVAILABILITY',
        version: 4,
        availability: 'AVAILABLE',
      })
    ).status,
  ).toBe(403);
  expect(
    (await f.a.primary.call(`/couriers/${ownId}?locationId=${f.otherLocation.id}`)).status,
  ).toBe(404);
  expect((await f.b.primary.call(`/couriers/${ownId}?locationId=${f.b.location.id}`)).status).toBe(
    404,
  );
  const body = {
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    action: 'SET_AVAILABILITY',
    version: 4,
    availability: 'AVAILABLE',
  };
  expect((await own.expect(path(ownId), 'POST', body)).courier.availability).toBe('AVAILABLE');
  expect(
    (
      await own.expect(`${path(ownId)}/resolution`, 'POST', {
        locationId: body.locationId,
        requestKey: body.requestKey,
        action: body.action,
      })
    ).status,
  ).toBe('SUCCEEDED');
  expect(
    (
      await own.call(path(ownId), 'POST', {
        ...body,
        requestKey: randomUUID(),
        availability: 'IN_DELIVERY',
      })
    ).status,
  ).toBe(400);
  await f.a.primary.expect(`/staff/${f.reader.user.id}/overrides`, 'POST', {
    permission: 'couriers.read',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  expect((await (await f.login(f.reader)).call(read(ownId))).status).toBe(403);
});
it('curier: încărcarea, capacitatea și pauza se reflectă și în atribuirea existentă', async () => {
  const own = await f.login();
  const courierId = randomUUID();
  await f.a.primary.expect(path(courierId), 'POST', f.body(f.second.user.id));
  const list = await f.a.primary.call(`/couriers?locationId=${f.a.location.id}&limit=1`);
  expect(list.headers.get('cache-control')).toBe('no-store');
  expect(list.data.nextCursor).toBeTruthy();
  expect(
    (
      await f.a.primary.call(
        `/couriers?locationId=${f.otherLocation.id}&cursor=${encodeURIComponent(list.data.nextCursor)}`,
      )
    ).status,
  ).toBe(400);
  const draft = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({ serviceType: 'DELIVERY', tableLabel: undefined }),
    )
  ).order;
  let order = (
    await f.a.primary.expect(`/orders/${draft.id}/confirm`, 'POST', {
      version: draft.version,
      requestKey: randomUUID(),
    })
  ).order;
  const assign = (userId: string) =>
    f.a.primary.call(`/orders/${order.id}/delivery`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
      status: 'ASSIGNED',
      courierUserId: userId,
    });
  expect((await assign(f.second.user.id)).status).toBe(409);
  const assignment = await assign(f.own.user.id);
  expect(assignment.status).toBe(200);
  order = assignment.data.order;
  expect((await own.expect(`/couriers/me?locationId=${f.a.location.id}`)).courier).toMatchObject({
    effectiveStatus: 'IN_DELIVERY',
    activeDeliveries: 1,
  });
  const change = {
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    action: 'SET_AVAILABILITY',
    version: 5,
  };
  expect((await own.call(path(ownId), 'POST', { ...change, availability: 'OFFLINE' })).status).toBe(
    409,
  );
  await own.expect(path(ownId), 'POST', { ...change, availability: 'PAUSED' });
  const available = await f.a.primary.expect(`/orders/${order.id}/delivery-couriers`);
  expect(available.couriers.map((value: { id: string }) => value.id)).not.toContain(f.own.user.id);
  expect(available.couriers.map((value: { id: string }) => value.id)).not.toContain(
    f.second.user.id,
  );
  expect(
    (
      await f.a.primary.call(path(ownId), 'POST', {
        locationId: f.a.location.id,
        action: 'ARCHIVE',
        version: 6,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  await own.expect(`/orders/${order.id}/delivery`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
    status: 'FAILED',
    reason: 'Destinație indisponibilă',
  });
  await f.a.primary.expect(path(ownId), 'POST', {
    locationId: f.a.location.id,
    action: 'ARCHIVE',
    version: 6,
    requestKey: randomUUID(),
  });
});
it('curier: MFA și DENY sunt evaluate înainte de administrare și recuperare', async () => {
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Administrator curieri',
      permissions: [{ permission: 'couriers.read' }, { permission: 'couriers.manage' }],
    })
  ).role;
  const actor = await f.a.primary.expect('/staff', 'POST', {
    login: 'courier-manager',
    displayName: 'Administrator curieri',
    locationIds: [f.a.location.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
    ],
  });
  const manager = new BrowserSession('TENANT');
  const credentials = await activate(
    manager,
    'courier-manager',
    actor.temporaryPassword,
    f.a.company.organization.slug,
  );
  const id = randomUUID(),
    body = f.body(f.third.user.id);
  expect((await manager.call(path(id), 'POST', body)).status).toBe(403);
  const secret = await manager.enroll();
  expect((await manager.expect(path(id), 'POST', body)).courier.id).toBe(id);
  await f.a.primary.expect(`/staff/${actor.user.id}/overrides`, 'POST', {
    permission: 'couriers.manage',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  const renewed = new BrowserSession('TENANT');
  const state = await renewed.login(
    'courier-manager',
    credentials.permanent,
    f.a.company.organization.slug,
  );
  if (state.stage === 'mfa')
    await renewed.expect('/auth/mfa/verify', 'POST', { code: totp(secret) });
  expect((await renewed.expect(read(id))).courier.id).toBe(id);
  expect(
    (
      await renewed.call(`${path(id)}/resolution`, 'POST', {
        locationId: body.locationId,
        action: body.action,
        requestKey: body.requestKey,
      })
    ).status,
  ).toBe(403);
});
