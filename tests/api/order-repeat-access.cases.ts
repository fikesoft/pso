import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { OrderRepeatFixture } from './order-repeat.types';

export async function verifyRepeatAccess(f: OrderRepeatFixture) {
  const order = await f.create();
  const path = `/orders/${order.id}/repeat-preview`;
  const body = { locationId: f.a.location.id };
  expect((await f.a.primary.call(path, 'POST', body)).status).toBe(409);
  await f.confirm(order.id);
  const limitedRead = await f.loginRepeat(f.limitedRead);
  expect((await limitedRead.call(path, 'POST', body)).status).toBe(403);
  expect((await f.b.primary.call(path, 'POST', { locationId: f.b.location.id })).status).toBe(404);
  const basic = await f.loginCustomer(f.basic);
  expect((await basic.call(path, 'POST', { locationId: f.otherLocation.id })).status).toBe(403);
  expect((await f.a.primary.call(path, 'POST', { locationId: f.b.location.id })).status).toBe(403);
  const limitedCreate = await f.loginRepeat(f.limitedCreate);
  const limited = await f.preview(order.id, limitedCreate);
  expect(limited).toMatchObject({
    canCreate: false,
    amountAllowed: false,
    estimatedTotal: order.total,
  });
  expect(limited.lines.every((line: { candidate: unknown }) => line.candidate !== null)).toBe(true);
  expect(
    (
      await limitedCreate.call(
        '/orders',
        'POST',
        f.draft({ items: limited.lines.map((line: { candidate: unknown }) => line.candidate) }),
      )
    ).status,
  ).toBe(403);
  expect((await f.a.primary.call(path, 'POST', { ...body, orderVersion: 1 })).status).toBe(400);
  await f.a.primary.expect(`/orders/${order.id}/cancel`, 'POST', {
    version: (await f.current(order.id)).version,
    requestKey: randomUUID(),
    reason: 'Anulare sintetică pentru preview',
  });
  expect((await f.preview(order.id)).source.status).toBe('CANCELLED');
}

export async function verifyRepeatRevocation(f: OrderRepeatFixture) {
  const order = await f.complete({ customerRef: { id: f.customer.id, version: 1 } });
  const path = `/orders/${order.id}/repeat-preview`;
  const latest = `/customers/${f.customer.id}/last-order?locationId=${f.a.location.id}`;
  await f.a.primary.expect(`/staff/${f.full.user.id}/overrides`, 'POST', {
    permission: 'orders.read',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  const deniedRead = await f.loginRepeat();
  expect((await deniedRead.call(path, 'POST', { locationId: f.a.location.id })).status).toBe(403);
  expect((await deniedRead.call(latest)).status).toBe(403);
  expect(
    (
      await deniedRead.expect('/customers/lookup', 'POST', {
        locationId: f.a.location.id,
        phone: f.customer.phone,
      })
    ).customer.id,
  ).toBe(f.customer.id);
  await f.a.primary.expect(`/staff/${f.limitedCreate.user.id}/overrides`, 'POST', {
    permission: 'customers.read',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const deniedCrm = await f.loginRepeat(f.limitedCreate);
  expect((await deniedCrm.call(latest)).status).toBe(403);
  expect((await deniedCrm.call(path, 'POST', { locationId: f.a.location.id })).status).toBe(200);
  await f.a.primary.expect(`/staff/${f.limitedRead.user.id}/overrides`, 'POST', {
    permission: 'orders.create',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  const cheap = await f.create({ items: [{ productId: f.secondProduct.id, quantity: '0.1' }] });
  await f.confirm(cheap.id);
  const deniedCreate = await f.loginRepeat(f.limitedRead);
  expect(
    (
      await deniedCreate.call(`/orders/${cheap.id}/repeat-preview`, 'POST', {
        locationId: f.a.location.id,
      })
    ).status,
  ).toBe(403);
}
