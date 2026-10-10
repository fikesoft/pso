import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CustomerAddressFixture } from './customer-address.types';

export async function verifyAddressOrderSnapshots(f: CustomerAddressFixture) {
  const address = (await f.a.primary.expect(f.path(), 'POST', f.addressBody())).address;
  const ref = { id: address.id, version: 1 };
  const customerRef = { id: f.customer.id, version: 1 };
  const body = f.draft({ serviceType: 'DELIVERY', customerRef, addressRef: ref });
  expect(
    (await f.a.primary.call('/orders', 'POST', { ...body, deliveryAddress: { address: 'Manual' } }))
      .status,
  ).toBe(400);
  expect(
    (await f.a.primary.call('/orders', 'POST', { ...body, serviceType: 'PICKUP' })).status,
  ).toBe(400);
  expect((await f.a.primary.call('/orders', 'POST', { ...body, customerRef: null })).status).toBe(
    409,
  );
  expect(
    (
      await f.a.primary.call('/orders', 'POST', {
        ...body,
        customerRef: { id: f.secondCustomer.id, version: 1 },
      })
    ).status,
  ).toBe(409);
  expect(
    (await f.a.primary.call('/orders', 'POST', { ...body, addressRef: { ...ref, version: 2 } }))
      .status,
  ).toBe(409);
  const foreign = (
    await f.b.primary.expect(
      f.path(f.foreignCustomer.id),
      'POST',
      f.addressBody({ locationId: f.b.location.id }),
    )
  ).address;
  expect(
    (
      await f.a.primary.call('/orders', 'POST', {
        ...body,
        addressRef: { id: foreign.id, version: 1 },
      })
    ).status,
  ).toBe(404);
  let order = (await f.a.primary.expect('/orders', 'POST', body)).order;
  const snapshot = { address: address.address, instructions: address.instructions };
  expect(order).toMatchObject({ deliveryAddress: snapshot, addressRef: ref });
  const basic = await f.loginCustomer(f.basic);
  const patch = (extra: Record<string, unknown> = {}) => ({
    version: order.version,
    serviceType: 'DELIVERY',
    items: [{ id: order.items[0].id, productId: order.items[0].productId, quantity: '3' }],
    ...extra,
  });
  order = (await basic.expect(`/orders/${order.id}`, 'PATCH', patch())).order;
  expect(order).toMatchObject({ deliveryAddress: snapshot, addressRef: ref });
  expect(
    (await basic.call(`/orders/${order.id}`, 'PATCH', patch({ customerRef: null }))).status,
  ).toBe(409);
  expect(
    (await basic.call(`/orders/${order.id}`, 'PATCH', patch({ serviceType: 'PICKUP' }))).status,
  ).toBe(409);
  order = (
    await basic.expect(
      `/orders/${order.id}`,
      'PATCH',
      patch({ customerRef: null, addressRef: null }),
    )
  ).order;
  expect(order).toMatchObject({ deliveryAddress: snapshot, addressRef: null, customerRef: null });
  order = (
    await basic.expect(`/orders/${order.id}`, 'PATCH', patch({ customer: { name: 'Manual' } }))
  ).order;
  expect(order.deliveryAddress).toEqual(snapshot);
  order = (
    await basic.expect(
      `/orders/${order.id}`,
      'PATCH',
      patch({ serviceType: 'PICKUP', deliveryAddress: null }),
    )
  ).order;
  expect(order).toMatchObject({ deliveryAddress: null, addressRef: null, serviceType: 'PICKUP' });
  order = (
    await basic.expect(
      `/orders/${order.id}`,
      'PATCH',
      patch({ deliveryAddress: { address: 'Destinație manuală' } }),
    )
  ).order;
  expect(order).toMatchObject({
    deliveryAddress: { address: 'Destinație manuală', instructions: null },
    addressRef: null,
  });
  const historicalBody = f.draft({ serviceType: 'DELIVERY', customerRef, addressRef: ref });
  const historical = (await f.a.primary.expect('/orders', 'POST', historicalBody)).order;
  const confirmed = await f.a.primary.expect(`/orders/${historical.id}/confirm`, 'POST', {
    version: 1,
    requestKey: randomUUID(),
  });
  expect(confirmed.order).not.toHaveProperty('deliveryAddress');
  expect(confirmed.order).not.toHaveProperty('addressRef');
  await f.a.primary.expect(`${f.path()}/${address.id}/archive`, 'POST', {
    locationId: f.a.location.id,
    version: 1,
    requestKey: randomUUID(),
  });
  expect(
    (await f.a.primary.expect('/orders', 'POST', historicalBody)).order.deliveryAddress,
  ).toEqual(snapshot);
  expect(
    (await f.a.primary.call('/orders', 'POST', { ...historicalBody, requestKey: randomUUID() }))
      .status,
  ).toBe(409);
  expect((await basic.expect(`/orders/${historical.id}`)).order).toMatchObject({
    deliveryAddress: snapshot,
    addressRef: ref,
  });
  const timeline = JSON.stringify(await basic.expect(`/orders/${historical.id}/timeline`));
  expect(timeline).not.toContain(snapshot.address);
  expect(timeline).not.toContain(snapshot.instructions);
}

export async function verifyWebsiteAddress(f: CustomerAddressFixture) {
  const before = await f.a.primary.expect(f.listPath());
  const manual = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        serviceType: 'DELIVERY',
        customerRef: { id: f.customer.id, version: 1 },
        deliveryAddress: {
          address: 'Adresă manuală nereținută în agendă',
          instructions: 'Sună la intrare',
        },
      }),
    )
  ).order;
  expect(manual.addressRef).toBeNull();
  expect(await f.a.primary.expect(f.listPath())).toEqual(before);
  const body = f.order({
    customer: { name: f.customer.name, phone: f.customer.phone },
    delivery: { address: 'Destinație website', instructions: 'Website indicații' },
  });
  const received = await f.inbound('/orders', 'POST', body);
  expect(received.status).toBe(200);
  const accepted = await f.a.primary.expect(
    `/website/orders/${received.data.receipt.id}/accept`,
    'POST',
    { version: 1 },
  );
  const order = (await f.a.primary.expect(`/orders/${accepted.orderId}`)).order;
  expect(order).toMatchObject({
    deliveryAddress: body.delivery,
    addressRef: null,
    customerRef: null,
  });
  expect(await f.a.primary.expect(f.listPath())).toEqual(before);
  const legacyBody = f.draft();
  const legacy = (await f.a.primary.expect('/orders', 'POST', legacyBody)).order;
  expect(legacy).toMatchObject({ deliveryAddress: null, addressRef: null });
  expect(
    (
      await f.a.primary.expect('/orders', 'POST', {
        ...legacyBody,
        deliveryAddress: null,
        addressRef: null,
      })
    ).order.id,
  ).toBe(legacy.id);
}
