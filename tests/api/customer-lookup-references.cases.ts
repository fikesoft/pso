import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CustomerLookupFixture } from './customer-lookup.types';

export async function verifyCustomerReferences(f: CustomerLookupFixture) {
  const registration = f.registration();
  const { customer } = await f.a.primary.expect('/customers', 'POST', registration);
  const ref = { id: customer.id, version: customer.version };
  const body = f.draft({ customerRef: ref });
  expect(
    (await f.a.primary.call('/orders', 'POST', { ...body, customer: { name: 'Forged' } })).status,
  ).toBe(400);
  expect(
    (await f.a.primary.call('/orders', 'POST', { ...body, customerRef: { ...ref, version: 2 } }))
      .status,
  ).toBe(409);
  const foreign = (
    await f.b.primary.expect('/customers', 'POST', {
      ...f.registration(),
      locationId: f.b.location.id,
    })
  ).customer;
  expect(
    (
      await f.a.primary.call('/orders', 'POST', {
        ...body,
        customerRef: { id: foreign.id, version: 1 },
      })
    ).status,
  ).toBe(404);
  let order = (await f.a.primary.expect('/orders', 'POST', body)).order;
  expect(order.customerRef).toEqual(ref);
  expect(order.customer).toEqual({ name: customer.name, phone: customer.phone });
  const basic = await f.loginCustomer(f.basic);
  expect((await basic.expect(`/orders/${order.id}`)).order).toMatchObject({
    customerRef: ref,
    customer: order.customer,
  });
  expect(
    (
      await basic.call('/customers/lookup', 'POST', {
        locationId: f.a.location.id,
        phone: customer.phone,
      })
    ).status,
  ).toBe(403);
  const patch = (extra: Record<string, unknown> = {}) => ({
    version: order.version,
    serviceType: 'PICKUP',
    items: [{ id: order.items[0].id, productId: order.items[0].productId, quantity: '3' }],
    ...extra,
  });
  order = (await basic.expect(`/orders/${order.id}`, 'PATCH', patch())).order;
  expect(order.customerRef).toEqual(ref);
  const snapshot = order.customer;
  order = (await basic.expect(`/orders/${order.id}`, 'PATCH', patch({ customerRef: null }))).order;
  expect(order.customerRef).toBeNull();
  expect(order.customer).toEqual(snapshot);
  order = (await f.a.primary.expect(`/orders/${order.id}`, 'PATCH', patch({ customerRef: ref })))
    .order;
  order = (
    await basic.expect(
      `/orders/${order.id}`,
      'PATCH',
      patch({ customer: { name: 'Notă contact manual', phone: customer.phone } }),
    )
  ).order;
  expect(order.customerRef).toBeNull();
  expect(order.customer.name).toBe('Notă contact manual');
  expect((await f.lookup(customer.phone)).customer).toEqual(customer);
  order = (await f.a.primary.expect(`/orders/${order.id}`, 'PATCH', patch({ customerRef: ref })))
    .order;
  order = (await basic.expect(`/orders/${order.id}`, 'PATCH', patch({ customer: null }))).order;
  expect(order.customerRef).toBeNull();
  expect(order.customer).toBeNull();
  const historical = (await f.a.primary.expect('/orders', 'POST', f.draft({ customerRef: ref })))
    .order;
  await f.a.primary.expect(`/orders/${historical.id}/confirm`, 'POST', {
    version: 1,
    requestKey: randomUUID(),
  });
  const stored = (await basic.expect(`/orders/${historical.id}`)).order;
  expect(stored.customerRef).toEqual(ref);
  expect(stored.customer).toEqual(snapshot);
  const timeline = await basic.expect(`/orders/${historical.id}/timeline`);
  expect(JSON.stringify(timeline)).not.toContain(customer.phone);
  expect(JSON.stringify(timeline)).not.toContain(customer.name);
}
