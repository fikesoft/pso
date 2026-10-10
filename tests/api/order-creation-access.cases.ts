import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { OrderCreationFixture } from './order-creation.types';
import { BrowserSession } from './support/harness';

export async function verifyCreationAuthorization(f: OrderCreationFixture) {
  const writer = await f.login();
  const limited = await f.login(1);
  const withdrawn = await f.login(2);
  const body = f.draft();
  const order = (await writer.expect('/orders', 'POST', body)).order;
  const resolution = { locationId: f.a.location.id, requestKey: body.requestKey };
  const anonymous = new BrowserSession('TENANT');
  expect((await anonymous.call('/orders/creation-resolution', 'POST', resolution)).status).not.toBe(
    200,
  );
  expect((await limited.call('/orders', 'POST', body)).status).toBe(403);
  expect((await limited.call('/orders/creation-resolution', 'POST', resolution)).status).toBe(403);
  expect(
    (
      await writer.call('/orders/creation-resolution', 'POST', {
        ...resolution,
        locationId: f.otherLocation.id,
      })
    ).status,
  ).toBe(403);
  expect((await f.b.primary.call('/orders/creation-resolution', 'POST', resolution)).status).toBe(
    403,
  );
  const scoped = { ...resolution, locationId: f.otherLocation.id };
  expect(await f.a.primary.expect('/orders/creation-resolution', 'POST', scoped)).toEqual({
    status: 'RETIRED',
    ...scoped,
  });
  const foreign = { ...resolution, locationId: f.b.location.id };
  expect(await f.b.primary.expect('/orders/creation-resolution', 'POST', foreign)).toEqual({
    status: 'RETIRED',
    ...foreign,
  });
  expect((await writer.expect('/orders/creation-resolution', 'POST', resolution)).order.id).toBe(
    order.id,
  );
  const revoked = (await f.a.primary.expect('/staff')).users.find(
    (user: { id: string }) => user.id === f.actors[2]!.user.id,
  );
  await f.a.primary.expect(`/staff/${revoked.id}`, 'PATCH', {
    version: revoked.version,
    locationIds: [f.otherLocation.id],
  });
  expect((await withdrawn.call('/orders/creation-resolution', 'POST', resolution)).status).not.toBe(
    200,
  );
  expect(
    (await (await f.login(2)).call('/orders/creation-resolution', 'POST', resolution)).status,
  ).toBe(403);
  await f.a.primary.expect(`/staff/${f.actors[0]!.user.id}/overrides`, 'POST', {
    permission: 'orders.create',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.login();
  expect((await denied.call('/orders', 'POST', body)).status).toBe(403);
  expect((await denied.call('/orders/creation-resolution', 'POST', resolution)).status).toBe(403);
  expect(
    (
      await denied.call('/orders/creation-resolution', 'POST', {
        ...resolution,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(403);
  expect((await f.a.primary.expect(`/orders/${order.id}`)).order.version).toBe(1);
}
