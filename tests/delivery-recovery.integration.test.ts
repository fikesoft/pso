import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareDelivery } from './api/delivery-setup';
import type { DeliveryFixture } from './api/delivery.types';
import { closeOperations } from './api/operations-setup';
let f: DeliveryFixture;
beforeAll(async () => {
  f = await prepareDelivery();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
it('delivery recovery: committed response and terminal retirement with current actor authorization', async () => {
  const order = await f.create();
  await f.confirm(order.id);
  const path = `/orders/${order.id}/delivery`,
    resolve = `${path}/resolution`;
  const body = await f.command(order.id, 'ASSIGNED', { courierUserId: f.courier.user.id });
  const original = await f.a.primary.expect(path, 'POST', body);
  const pointer = { locationId: f.a.location.id, requestKey: body.requestKey, status: 'ASSIGNED' };
  const recovered = await f.a.primary.expect(resolve, 'POST', pointer);
  expect(recovered.status).toBe('SUCCEEDED');
  expect(recovered.operation).toEqual(original.operation);
  expect((await f.a.primary.call(resolve, 'POST', { ...pointer, status: 'FAILED' })).status).toBe(
    409,
  );
  expect((await f.b.primary.call(resolve, 'POST', pointer)).status).toBe(404);
  expect(
    (await f.a.primary.call(resolve, 'POST', { ...pointer, locationId: f.otherLocation.id }))
      .status,
  ).toBe(404);
  const actor = await f.login();
  expect((await actor.call(resolve, 'POST', pointer)).status).toBe(403);
  const failed = await f.command(order.id, 'FAILED', { reason: 'Client indisponibil' });
  const failPointer = {
    locationId: f.a.location.id,
    requestKey: failed.requestKey,
    status: 'FAILED',
  };
  const retired = await actor.expect(resolve, 'POST', failPointer);
  expect(retired.status).toBe('RETIRED');
  expect(await actor.expect(resolve, 'POST', failPointer)).toEqual(retired);
  expect((await actor.call(path, 'POST', failed)).status).toBe(409);
  expect((await f.a.primary.call(resolve, 'POST', failPointer)).status).toBe(409);
  const next = { ...failed, requestKey: randomUUID() };
  await actor.expect(path, 'POST', next);
  expect(
    (await actor.expect(resolve, 'POST', { ...failPointer, requestKey: next.requestKey })).status,
  ).toBe('SUCCEEDED');
  // A manager cannot replay another actor's operation by copying its body.
  expect((await f.a.primary.call(path, 'POST', next)).status).toBe(409);
  await f.a.primary.expect(`/staff/${f.courier.user.id}/overrides`, 'POST', {
    permission: 'delivery.update',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.login();
  expect((await denied.call(resolve, 'POST', failPointer)).status).toBe(403);
  expect(
    (await denied.call(resolve, 'POST', { ...failPointer, requestKey: next.requestKey })).status,
  ).toBe(403);
});
