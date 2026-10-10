import { expect } from 'vitest';
import type { CustomerLookupFixture } from './customer-lookup.types';

export async function verifyCustomerAccess(f: CustomerLookupFixture) {
  const registration = f.registration();
  const { customer } = await f.a.primary.expect('/customers', 'POST', registration);
  const lookup = { locationId: f.a.location.id, phone: customer.phone };
  const reader = await f.loginCustomer(f.reader);
  expect((await reader.expect('/customers/lookup', 'POST', lookup)).customer.id).toBe(customer.id);
  expect((await reader.call('/customers', 'POST', f.registration())).status).toBe(403);
  for (const account of [f.basic, f.createOnly]) {
    const actor = await f.loginCustomer(account);
    expect((await actor.call('/customers/lookup', 'POST', lookup)).status).toBe(403);
    expect((await actor.call('/customers', 'POST', f.registration())).status).toBe(403);
    expect(
      (
        await actor.call(
          '/orders',
          'POST',
          f.draft({ customerRef: { id: customer.id, version: 1 } }),
        )
      ).status,
    ).toBe(403);
  }
  const restricted = await f.loginCustomer(f.restricted);
  expect(
    (
      await restricted.call('/customers/lookup', 'POST', {
        ...lookup,
        locationId: f.otherLocation.id,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await restricted.call(
        '/customers',
        'POST',
        f.registration({ locationId: f.otherLocation.id }),
      )
    ).status,
  ).toBe(403);
  expect((await f.b.primary.call('/customers/lookup', 'POST', lookup)).status).toBe(403);
  expect(
    (
      await f.a.primary.call('/staff', 'POST', {
        login: 'invalid-local-customer',
        displayName: 'Local nepermis',
        authenticationMethod: 'PIN',
        locationIds: [f.a.location.id],
        assignments: [
          {
            roleVersionId: f.writer.role.versions[0].id,
            scopeType: 'LOCATION',
            locationId: f.a.location.id,
          },
        ],
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.a.primary.call(`/staff/${f.basic.actor.user.id}/overrides`, 'POST', {
        permission: 'customers.read',
        effect: 'ALLOW',
        scopeType: 'LOCATION',
        locationId: f.a.location.id,
      })
    ).status,
  ).toBe(400);
  const writer = await f.loginCustomer();
  const body = f.registration();
  const created = await writer.expect('/customers', 'POST', body);
  const orderBody = f.draft({ customerRef: { id: created.customer.id, version: 1 } });
  const order = (await writer.expect('/orders', 'POST', orderBody)).order;
  const initiallyUnlinked = f.draft();
  const laterLinked = (await writer.expect('/orders', 'POST', initiallyUnlinked)).order;
  await writer.expect(`/orders/${laterLinked.id}`, 'PATCH', {
    version: laterLinked.version,
    serviceType: 'PICKUP',
    items: initiallyUnlinked.items,
    customerRef: { id: created.customer.id, version: 1 },
  });
  await f.a.primary.expect(`/staff/${f.writer.actor.user.id}/overrides`, 'POST', {
    permission: 'customers.read',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.loginCustomer();
  expect((await denied.call('/customers', 'POST', body)).status).toBe(403);
  expect(
    (await denied.call('/customers/lookup', 'POST', { ...lookup, phone: body.phone })).status,
  ).toBe(403);
  expect((await denied.call('/orders', 'POST', orderBody)).status).toBe(403);
  expect((await denied.call('/orders', 'POST', initiallyUnlinked)).status).toBe(403);
  expect(
    (
      await denied.call('/orders/creation-resolution', 'POST', {
        locationId: f.a.location.id,
        requestKey: orderBody.requestKey,
      })
    ).status,
  ).toBe(403);
  expect((await denied.expect(`/orders/${order.id}`)).order.customer).toEqual(order.customer);
  const second = await f.loginCustomer(f.secondWriter);
  const secondBody = f.registration();
  await second.expect('/customers', 'POST', secondBody);
  await f.a.primary.expect(`/staff/${f.secondWriter.actor.user.id}/overrides`, 'POST', {
    permission: 'customers.create',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const noCreate = await f.loginCustomer(f.secondWriter);
  expect((await noCreate.call('/customers', 'POST', secondBody)).status).toBe(403);
  expect(
    (await noCreate.expect('/customers/lookup', 'POST', { ...lookup, phone: secondBody.phone }))
      .customer,
  ).not.toBeNull();
}
