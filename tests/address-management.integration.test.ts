import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareCustomerAddresses } from './api/customer-address-setup';
import type { CustomerAddressFixture } from './api/customer-address.types';
import { closeOperations } from './api/operations-setup';
import { db, noSecrets } from './api/support/harness';
let f: CustomerAddressFixture;
beforeAll(async () => {
  f = await prepareCustomerAddresses();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
const body = (action: string, version: number, extra: Record<string, unknown> = {}) => ({
  locationId: f.a.location.id,
  action,
  version,
  requestKey: randomUUID(),
  ...extra,
});
const bookPath = (customerId = f.customer.id) =>
  `/customers/${customerId}/address-book?locationId=${f.a.location.id}`;
const create = async (customerId = f.customer.id) =>
  (await f.a.primary.expect(f.path(customerId), 'POST', f.addressBody())).address;

it('editează o dată, gestionează preferința separat și păstrează snapshoturile și replay-ul istoric', async () => {
  const address = await create();
  const path = `${f.path()}/${address.id}/commands`;
  const order = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        serviceType: 'DELIVERY',
        customerRef: { id: f.customer.id, version: 1 },
        addressRef: { id: address.id, version: 1 },
      }),
    )
  ).order;
  const select = body('SET_DEFAULT', 1, { preferenceVersion: 1 });
  const selected = await f.a.primary.expect(path, 'POST', select);
  expect(selected).toMatchObject({
    address: { version: 1 },
    preference: { version: 2, defaultAddressId: address.id },
  });
  const profile = { label: 'Birou nou', address: 'Strada CRM 131', instructions: 'Intrare nouă' };
  const edit = body('UPDATE', 1, { profile });
  const [a, b] = await Promise.all([
    f.a.primary.expect(path, 'POST', edit),
    f.a.primary.expect(path, 'POST', edit),
  ]);
  expect(a).toEqual(b);
  expect(a).toMatchObject({
    address: { ...profile, version: 2 },
    preference: { version: 2, defaultAddressId: address.id },
  });
  expect((await f.a.primary.call(path, 'POST', body('UPDATE', 2, { profile }))).status).toBe(409);
  expect(
    (await f.a.primary.call(path, 'POST', { ...edit, profile: { ...profile, label: 'Alt corp' } }))
      .status,
  ).toBe(409);
  expect((await f.a.primary.expect(`/orders/${order.id}`)).order).toEqual(order);
  const archive = { locationId: f.a.location.id, version: 2, requestKey: randomUUID() };
  const legacy = await f.a.primary.expect(`${f.path()}/${address.id}/archive`, 'POST', archive);
  expect(legacy.address).toMatchObject({ status: 'ARCHIVED', version: 3, ...profile });
  expect(await f.a.primary.expect(`${f.path()}/${address.id}/archive`, 'POST', archive)).toEqual(
    legacy,
  );
  const book = await f.a.primary.expect(`${bookPath()}&status=ARCHIVED`);
  expect(book.preference).toMatchObject({ version: 3, defaultAddressId: null });
  expect(book.addresses.map((row: { id: string }) => row.id)).toContain(address.id);
  const replay = await f.a.primary.expect(path, 'POST', select);
  expect(replay.result).toEqual(selected.result);
  expect(replay.address.status).toBe('ARCHIVED');
  expect(replay.preference).toEqual(book.preference);
  const resolved = await f.a.primary.expect(`${path}/resolution`, 'POST', {
    locationId: edit.locationId,
    requestKey: edit.requestKey,
    action: edit.action,
  });
  expect(resolved.result).toEqual(a.result);
  expect(resolved.address.status).toBe('ARCHIVED');
  const stored = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    async (tx) => ({
      commands: await tx.customerAddressCommand.findMany({ where: { addressId: address.id } }),
      address: await tx.customerAddress.findUniqueOrThrow({ where: { id: address.id } }),
      audit: await tx.auditEvent.findMany({ where: { targetId: address.id } }),
    }),
  );
  expect(stored.commands).toHaveLength(3);
  expect(JSON.stringify(stored)).not.toMatch(/Birou nou|Strada CRM 131|Intrare nouă/);
  noSecrets(resolved);
});

it('preferințele concurente cer versiunea curentă, iar retragerea oprește modificările întârziate', async () => {
  const customerId = f.secondCustomer.id;
  const first = await create(customerId),
    second = await create(customerId);
  const path = `${f.path(customerId)}/${first.id}/commands`;
  const other = `${f.path(customerId)}/${second.id}/commands`;
  const results = await Promise.all([
    f.a.primary.call(path, 'POST', body('SET_DEFAULT', 1, { preferenceVersion: 1 })),
    f.a.primary.call(other, 'POST', body('SET_DEFAULT', 1, { preferenceVersion: 1 })),
  ]);
  expect(results.map((value) => value.status).sort()).toEqual([200, 409]);
  const preference = (await f.a.primary.expect(bookPath(customerId))).preference;
  expect(preference.version).toBe(2);
  const clearPath = preference.defaultAddressId === first.id ? path : other;
  const cleared = await f.a.primary.expect(
    clearPath,
    'POST',
    body('CLEAR_DEFAULT', 1, { preferenceVersion: 2 }),
  );
  expect(cleared.preference).toMatchObject({ version: 3, defaultAddressId: null });
  const edit = body('UPDATE', 1, {
    profile: { label: null, address: 'Retired synthetic', instructions: null },
  });
  const resolution = {
    locationId: edit.locationId,
    action: edit.action,
    requestKey: edit.requestKey,
  };
  const retired = await f.a.primary.expect(`${path}/resolution`, 'POST', resolution);
  expect(retired.status).toBe('RETIRED');
  expect((await f.a.primary.call(path, 'POST', edit)).status).toBe(409);
  expect(await f.a.primary.expect(`${path}/resolution`, 'POST', resolution)).toEqual(retired);
  const race = body('UPDATE', 1, {
    profile: { label: null, address: 'Race synthetic', instructions: null },
  });
  await Promise.all([
    f.a.primary.call(path, 'POST', race),
    f.a.primary.call(`${path}/resolution`, 'POST', {
      locationId: race.locationId,
      action: race.action,
      requestKey: race.requestKey,
    }),
  ]);
  const outcome = await f.a.primary.expect(`${path}/resolution`, 'POST', {
    locationId: race.locationId,
    action: race.action,
    requestKey: race.requestKey,
  });
  expect(outcome.address.version).toBe(outcome.status === 'SUCCEEDED' ? 2 : 1);
});

it('cursorul administrativ leagă clientul, actorul, locația și filtrul', async () => {
  for (let i = 0; i < 3; i++) await create();
  const first = await f.a.primary.expect(`${bookPath()}&limit=1`);
  expect(first.addresses).toHaveLength(1);
  expect(first.nextCursor).toBeTruthy();
  const cursor = encodeURIComponent(first.nextCursor);
  const next = await f.a.primary.expect(`${bookPath()}&limit=1&cursor=${cursor}`);
  expect(next.addresses[0].id).not.toBe(first.addresses[0].id);
  for (const path of [
    `${bookPath()}&status=ALL`,
    bookPath(f.secondCustomer.id),
    `/customers/${f.customer.id}/address-book?locationId=${f.otherLocation.id}`,
  ])
    expect((await f.a.primary.call(`${path}&cursor=${cursor}`)).status).toBe(400);
  const reader = await f.loginCustomer(f.reader);
  expect((await reader.call(`${bookPath()}&cursor=${cursor}`)).status).toBe(400);
  const read = await reader.call(bookPath());
  expect(read.status).toBe(200);
  expect(read.headers.get('cache-control')).toBe('no-store');
  expect((await f.a.primary.call(`${bookPath()}&cursor=${randomUUID()}`)).status).toBe(400);
  expect((await reader.call(bookPath(f.foreignCustomer.id))).status).toBe(404);
});

it('permisiunea distinctă, actorul, locația și DENY rămân obligatorii la recuperare', async () => {
  const address = await create();
  const path = `${f.path()}/${address.id}/commands`;
  const edit = body('UPDATE', 1, {
    profile: { label: null, address: 'Acces sintetic', instructions: null },
  });
  for (const account of [f.reader, f.writer]) {
    const reader = await f.loginCustomer(account);
    expect((await reader.call(path, 'POST', edit)).status).toBe(403);
  }
  const actor = await f.loginAddress();
  const saved = await actor.expect(path, 'POST', edit);
  expect(saved.address.version).toBe(2);
  const resolution = {
    locationId: edit.locationId,
    requestKey: edit.requestKey,
    action: edit.action,
  };
  const other = await f.loginAddress(f.otherManager);
  expect((await other.call(path, 'POST', edit)).status).toBe(409);
  expect((await other.call(`${path}/resolution`, 'POST', resolution)).status).toBe(409);
  const restricted = await f.loginAddress(f.restrictedManager);
  expect(
    (await restricted.call(path, 'POST', { ...edit, locationId: f.otherLocation.id })).status,
  ).toBe(403);
  await f.a.primary.expect(`/staff/${f.manager.user.id}/overrides`, 'POST', {
    permission: 'customers.addresses.manage',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.loginAddress();
  expect((await denied.call(path, 'POST', edit)).status).toBe(403);
  expect((await denied.call(`${path}/resolution`, 'POST', resolution)).status).toBe(403);
  expect(
    (await f.a.primary.expect(bookPath())).addresses.find(
      (row: { id: string }) => row.id === address.id,
    ).version,
  ).toBe(2);
});

it('CSRF, Origin și payload strict protejează comenzile; arhivarea clientului permite numai recuperarea terminală', async () => {
  const customer = (await f.a.primary.expect('/customers', 'POST', f.registration())).customer;
  const address = await create(customer.id);
  const path = `${f.path(customer.id)}/${address.id}/commands`;
  const choose = body('SET_DEFAULT', 1, { preferenceVersion: 1 });
  expect((await f.a.primary.call(path, 'POST', choose, {}, false)).status).toBe(403);
  expect(
    (await f.a.primary.call(path, 'POST', choose, { origin: 'https://foreign.invalid' })).status,
  ).toBe(403);
  expect(
    (await f.a.primary.call(path, 'POST', choose, { 'idempotency-key': randomUUID() })).status,
  ).toBe(400);
  for (const patch of [
    { organizationId: f.b.company.organization.id },
    { actorUserId: f.manager.user.id },
    { profile: { address: 'A' } },
    { preferenceVersion: 0 },
  ])
    expect((await f.a.primary.call(path, 'POST', { ...choose, ...patch })).status).toBe(400);
  const accepted = await f.a.primary.expect(path, 'POST', choose);
  await f.a.primary.expect(`/customers/${customer.id}/commands`, 'POST', body('ARCHIVE', 1));
  expect(
    (await f.a.primary.call(path, 'POST', body('CLEAR_DEFAULT', 1, { preferenceVersion: 2 })))
      .status,
  ).toBe(409);
  expect(
    (
      await f.a.primary.call(
        path,
        'POST',
        body('UPDATE', 1, {
          profile: { label: null, address: 'Client arhivat', instructions: null },
        }),
      )
    ).status,
  ).toBe(409);
  const resolution = {
    locationId: choose.locationId,
    requestKey: choose.requestKey,
    action: choose.action,
  };
  expect((await f.a.primary.expect(`${path}/resolution`, 'POST', resolution)).result).toEqual(
    accepted.result,
  );
  expect((await f.a.primary.expect(bookPath(customer.id))).preference).toMatchObject({
    version: 2,
    defaultAddressId: address.id,
  });
});
