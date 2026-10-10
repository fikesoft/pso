import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareCustomerLookup } from './api/customer-lookup-setup';
import type { CustomerLookupFixture } from './api/customer-lookup.types';
import { closeOperations } from './api/operations-setup';
import { noSecrets, fixturePasswords } from './api/support/harness';

let f: CustomerLookupFixture;
beforeAll(async () => {
  f = await prepareCustomerLookup();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
const path = (id: string, extra = '') =>
  `/customers/${id}/orders?locationId=${f.a.location.id}${extra}`;
const create = async () =>
  (await f.a.primary.expect('/customers', 'POST', f.registration())).customer;

it('istoricul include numai legături explicite și păstrează snapshotul după editare/arhivare', async () => {
  const customer = await create();
  const order = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        customerRef: { id: customer.id, version: 1 },
      }),
    )
  ).order;
  await f.a.primary.expect(
    '/orders',
    'POST',
    f.draft({ customer: { name: customer.name, phone: customer.phone } }),
  );
  const other = await create();
  await f.a.primary.expect(
    '/orders',
    'POST',
    f.draft({ customerRef: { id: other.id, version: 1 } }),
  );
  await f.a.primary.expect(`/customers/${customer.id}/commands`, 'POST', {
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    action: 'UPDATE',
    version: 1,
    profile: { name: 'Nume actualizat', phone: customer.phone, email: null },
  });
  await f.a.primary.expect(`/customers/${customer.id}/commands`, 'POST', {
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    action: 'ARCHIVE',
    version: 2,
  });
  const response = await f.a.primary.call(path(customer.id));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.data).toMatchObject({
    customerId: customer.id,
    locationId: f.a.location.id,
    nextCursor: null,
  });
  expect(response.data.orders).toEqual([order]);
  expect((await f.a.primary.expect(path(customer.id, '&status=COMPLETED'))).orders).toEqual([]);
  noSecrets(response.data);
});

it('pagina și cursorul sunt izolate pe client, actor, locație, tenant și filtru', async () => {
  const customer = await create();
  const ids: string[] = [];
  for (let i = 0; i < 3; i++)
    ids.unshift(
      (
        await f.a.primary.expect(
          '/orders',
          'POST',
          f.draft({
            customerRef: { id: customer.id, version: 1 },
          }),
        )
      ).order.id,
    );
  const first = await f.a.primary.expect(path(customer.id, '&limit=1'));
  expect(first.orders.map((row: { id: string }) => row.id)).toEqual(ids.slice(0, 1));
  const cursor = encodeURIComponent(first.nextCursor);
  const second = await f.a.primary.expect(path(customer.id, `&limit=2&cursor=${cursor}`));
  expect(second.orders.map((row: { id: string }) => row.id)).toEqual(ids.slice(1));
  expect(second.nextCursor).toBeNull();
  const other = await create();
  for (const url of [
    path(customer.id, `&status=DRAFT&cursor=${cursor}`),
    path(other.id, `&cursor=${cursor}`),
    `/customers/${customer.id}/orders?locationId=${f.otherLocation.id}&cursor=${cursor}`,
    path(customer.id, `&cursor=${randomUUID()}`),
    path(customer.id, '&organizationId=invalid'),
  ])
    expect((await f.a.primary.call(url)).status).toBe(400);
  const reader = await f.loginCustomer(f.reader);
  expect((await reader.call(path(customer.id, `&cursor=${cursor}`))).status).toBe(400);
  expect(
    (await f.b.primary.call(`/customers/${customer.id}/orders?locationId=${f.b.location.id}`))
      .status,
  ).toBe(404);
  expect(
    (await f.a.primary.expect(`/customers/${customer.id}/orders?locationId=${f.otherLocation.id}`))
      .orders,
  ).toEqual([]);
});

it('CRM și comenzi cer drepturi distincte și DENY retrage accesul la istoricul deja citit', async () => {
  const customer = await create();
  const basic = await f.loginCustomer(f.basic);
  expect((await basic.call(path(customer.id))).status).toBe(403);
  const reader = await f.loginCustomer(f.reader);
  expect(
    (await reader.call(`/customers/${customer.id}/orders?locationId=${f.otherLocation.id}`)).status,
  ).toBe(403);
  expect((await reader.call(path(customer.id))).status).toBe(200);
  await f.a.primary.expect(`/staff/${f.reader.actor.user.id}/overrides`, 'POST', {
    permission: 'orders.read',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  const denied = await f.loginCustomer(f.reader);
  expect((await denied.call(path(customer.id))).status).toBe(403);
  expect(
    (await denied.call(`/customers/${customer.id}?locationId=${f.a.location.id}`)).status,
  ).toBe(200);
});

it('limitele valorice nu divulgă comenzi și cursorul continuă după o pagină complet ascunsă', async () => {
  const customer = await create();
  const visible = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        customerRef: { id: customer.id, version: 1 },
      }),
    )
  ).order;
  for (let i = 0; i < 201; i++)
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        customerRef: { id: customer.id, version: 1 },
        items: [{ productId: f.product.id, quantity: '2' }],
      }),
    );
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Istoric plafonat',
      permissions: [{ permission: 'orders.read', limits: { maxAmount: '15.00' } }],
    })
  ).role;
  const actor = await f.a.primary.expect('/staff', 'POST', {
    login: 'history-limited',
    displayName: 'Cititor limitat',
    authenticationMethod: 'PIN',
    locationIds: [f.a.location.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
      { roleVersionId: f.reader.role!.versions[0].id, scopeType: 'ORGANIZATION' },
    ],
  });
  fixturePasswords.add(actor.pin);
  const limited = await f.loginCustomer({ actor, role });
  const first = await limited.expect(path(customer.id, '&limit=1'));
  expect(first.orders).toEqual([]);
  expect(first.nextCursor).toBeTruthy();
  expect(Object.keys(first).sort()).toEqual(['customerId', 'locationId', 'nextCursor', 'orders']);
  const next = await limited.expect(
    path(customer.id, `&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`),
  );
  expect(next.orders.map((row: { id: string }) => row.id)).toEqual([visible.id]);
  expect(next.nextCursor).toBeNull();
});
