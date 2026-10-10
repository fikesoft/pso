import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareCustomerLookup } from './api/customer-lookup-setup';
import type { CustomerLookupFixture } from './api/customer-lookup.types';
import { closeOperations } from './api/operations-setup';
import { db, noSecrets } from './api/support/harness';

let f: CustomerLookupFixture;
beforeAll(async () => {
  f = await prepareCustomerLookup();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
const read = async (id: string) =>
  (await f.a.primary.expect(`/customers/${id}?locationId=${f.a.location.id}`)).customer;
const create = async (extra: Record<string, unknown> = {}) =>
  (await f.a.primary.expect('/customers', 'POST', f.registration(extra))).customer;
const command = (action: string, version: number, extra: Record<string, unknown> = {}) => ({
  locationId: f.a.location.id,
  requestKey: randomUUID(),
  action,
  version,
  ...extra,
});

it('editează contactul criptat o dată, arhivează/restaurează și păstrează snapshotul comenzii', async () => {
  const original = await create({ name: 'Profil istoric', email: 'initial@example.test' });
  const path = `/customers/${original.id}/commands`;
  expect(await read(original.id)).toMatchObject({
    email: 'initial@example.test',
    status: 'ACTIVE',
    version: 1,
  });
  const order = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({ customerRef: { id: original.id, version: 1 } }),
    )
  ).order;
  const profile = { name: 'Profil actualizat', phone: '060998877', email: 'nou@example.test' };
  const body = command('UPDATE', 1, { profile });
  const [a, b] = await Promise.all([
    f.a.primary.expect(path, 'POST', body),
    f.a.primary.expect(path, 'POST', body),
  ]);
  expect(a).toEqual(b);
  expect(a).toMatchObject({
    status: 'SUCCEEDED',
    result: { action: 'UPDATE', expectedVersion: 1, version: 2 },
    customer: { ...profile, version: 2 },
  });
  expect((await f.a.primary.expect(`/orders/${order.id}`)).order).toEqual(order);
  expect(
    (await f.a.primary.call(path, 'POST', { ...body, profile: { ...profile, name: 'Alt corp' } }))
      .status,
  ).toBe(409);
  expect((await f.a.primary.call(path, 'POST', command('UPDATE', 2, { profile }))).status).toBe(
    409,
  );
  const archive = await f.a.primary.expect(path, 'POST', command('ARCHIVE', 2));
  expect(archive.customer).toMatchObject({ status: 'ARCHIVED', version: 3 });
  expect(await f.lookup(profile.phone)).toEqual({ customer: null });
  expect(
    (await f.a.primary.call('/customers', 'POST', f.registration({ phone: profile.phone }))).status,
  ).toBe(409);
  expect(
    (
      await f.a.primary.call(
        '/orders',
        'POST',
        f.draft({ customerRef: { id: original.id, version: 3 } }),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await f.a.primary.call(`/customers/${original.id}/addresses`, 'POST', {
        locationId: f.a.location.id,
        requestKey: randomUUID(),
        address: 'Adresă nouă',
      })
    ).status,
  ).toBe(409);
  const replay = await f.a.primary.expect(path, 'POST', body);
  expect(replay.result).toEqual(a.result);
  expect(replay.customer.status).toBe('ARCHIVED');
  const resolution = await f.a.primary.expect(`${path}/resolution`, 'POST', {
    locationId: body.locationId,
    requestKey: body.requestKey,
    action: 'UPDATE',
  });
  expect(resolution).toEqual(replay);
  const restored = await f.a.primary.expect(path, 'POST', command('RESTORE', 3));
  expect(restored.customer).toMatchObject({ status: 'ACTIVE', version: 4, ...profile });
  expect((await f.lookup(profile.phone)).customer.version).toBe(4);
  const stored = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    async (tx) => ({
      customer: await tx.customer.findUniqueOrThrow({ where: { id: original.id } }),
      commands: await tx.customerCommand.findMany({ where: { customerId: original.id } }),
      audit: await tx.auditEvent.findMany({ where: { targetId: original.id } }),
    }),
  );
  expect(stored.commands).toHaveLength(3);
  expect(JSON.stringify(stored)).not.toMatch(/Profil actualizat|060998877|nou@example/);
  noSecrets(replay);
});

it('listează și caută exact cu cursor legat de actor, locație, filtru și căutare', async () => {
  for (let i = 0; i < 3; i++) await create({ name: 'Grup CRM' });
  const body = { locationId: f.a.location.id, field: 'NAME', query: 'grup crm', limit: 1 };
  const first = await f.a.primary.expect('/customers/search', 'POST', body);
  expect(first.customers).toHaveLength(1);
  expect(first.nextCursor).toBeTruthy();
  const next = await f.a.primary.expect('/customers/search', 'POST', {
    ...body,
    cursor: first.nextCursor,
  });
  expect(next.customers[0].id).not.toBe(first.customers[0].id);
  for (const changed of [
    { query: 'Alt nume' },
    { status: 'ALL' },
    { locationId: f.otherLocation.id },
    { cursor: randomUUID() },
  ])
    expect(
      (
        await f.a.primary.call('/customers/search', 'POST', {
          ...body,
          cursor: first.nextCursor,
          ...changed,
        })
      ).status,
    ).toBe(400);
  const reader = await f.loginCustomer(f.reader);
  expect(
    (await reader.call('/customers/search', 'POST', { ...body, cursor: first.nextCursor })).status,
  ).toBe(400);
  const response = await reader.call(`/customers?locationId=${f.a.location.id}&limit=1`);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(
    (await reader.call(`/customers/${first.customers[0].id}?locationId=${f.otherLocation.id}`))
      .status,
  ).toBe(403);
  expect(
    (await f.b.primary.call(`/customers/${first.customers[0].id}?locationId=${f.b.location.id}`))
      .status,
  ).toBe(404);
  expect(
    (await f.a.primary.call(`/customers?locationId=${f.a.location.id}&phone=060123456`)).status,
  ).toBe(400);
  const archived = await f.a.primary.expect(
    `/customers/${first.customers[0].id}/commands`,
    'POST',
    command('ARCHIVE', 1),
  );
  expect(
    (
      await f.a.primary.expect(`/customers?locationId=${f.a.location.id}&status=ARCHIVED`)
    ).customers.map((row: { id: string }) => row.id),
  ).toContain(archived.customer.id);
});

it('retrage cheia definitiv, arbitrează execuția concurentă și verifică CSRF/Origin/payload', async () => {
  const customer = await create();
  const path = `/customers/${customer.id}/commands`;
  const body = command('ARCHIVE', 1);
  const resolve = { locationId: body.locationId, requestKey: body.requestKey, action: body.action };
  expect((await f.a.primary.expect(`${path}/resolution`, 'POST', resolve)).status).toBe('RETIRED');
  expect((await f.a.primary.call(path, 'POST', body)).status).toBe(409);
  expect((await read(customer.id)).version).toBe(1);
  for (const changed of [
    { organizationId: f.b.company.organization.id },
    { actorUserId: f.b.company.organization.primaryAdminUserId },
    { version: 0 },
  ])
    expect((await f.a.primary.call(path, 'POST', { ...body, ...changed })).status).toBe(400);
  expect((await f.a.primary.call(path, 'POST', body, {}, false)).status).toBe(403);
  expect(
    (await f.a.primary.call(path, 'POST', body, { origin: 'https://foreign.invalid' })).status,
  ).toBe(403);
  const race = command('ARCHIVE', 1);
  const results = await Promise.all([
    f.a.primary.call(path, 'POST', race),
    f.a.primary.call(`${path}/resolution`, 'POST', {
      locationId: race.locationId,
      requestKey: race.requestKey,
      action: race.action,
    }),
  ]);
  const terminal = results[1]!.data;
  expect(terminal.status).toMatch(/SUCCEEDED|RETIRED/);
  expect((await read(customer.id)).version).toBe(terminal.status === 'SUCCEEDED' ? 2 : 1);
  expect((await f.a.primary.call(path, 'POST', race)).status).toBe(
    terminal.status === 'SUCCEEDED' ? 200 : 409,
  );
});

it('cere drepturi organizaționale distincte și reevaluează DENY la replay/recuperare', async () => {
  const customer = await create();
  const path = `/customers/${customer.id}/commands`;
  const body = command('UPDATE', 1, {
    profile: { name: 'Editare PIN', phone: customer.phone, email: null },
  });
  for (const account of [f.writer, f.secondWriter])
    await f.a.primary.expect(`/staff/${account.actor.user.id}/overrides`, 'POST', {
      permission: 'customers.update',
      effect: 'ALLOW',
      scopeType: 'ORGANIZATION',
    });
  const actor = await f.loginCustomer();
  const second = await f.loginCustomer(f.secondWriter);
  const reader = await f.loginCustomer(f.reader);
  expect((await reader.call(path, 'POST', body)).status).toBe(403);
  const result = await actor.expect(path, 'POST', body);
  expect((await second.call(path, 'POST', body)).status).toBe(409);
  expect((await actor.call(path, 'POST', command('ARCHIVE', 2))).status).toBe(403);
  expect((await actor.call(path, 'POST', { ...body, locationId: f.otherLocation.id })).status).toBe(
    409,
  );
  await f.a.primary.expect(`/staff/${f.writer.actor.user.id}/overrides`, 'POST', {
    permission: 'customers.update',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.loginCustomer();
  expect((await denied.call(path, 'POST', body)).status).toBe(403);
  expect(
    (
      await denied.call(`${path}/resolution`, 'POST', {
        locationId: body.locationId,
        requestKey: body.requestKey,
        action: body.action,
      })
    ).status,
  ).toBe(403);
  expect((await read(customer.id)).version).toBe(result.customer.version);
});
