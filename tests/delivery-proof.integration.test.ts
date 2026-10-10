import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareDelivery } from './api/delivery-setup';
import type { DeliveryFixture } from './api/delivery.types';
import { closeOperations } from './api/operations-setup';
let f: DeliveryFixture;
beforeAll(async () => {
  f = await prepareDelivery();
  const id = randomUUID();
  await f.a.primary.expect(`/couriers/${id}/commands`, 'POST', {
    action: 'CREATE',
    locationId: f.a.location.id,
    userId: f.courier.user.id,
    requestKey: randomUUID(),
    profile: { vehicle: 'BICYCLE', capacity: 10 },
  });
  await f.a.primary.expect(`/couriers/${id}/commands`, 'POST', {
    action: 'SET_AVAILABILITY',
    locationId: f.a.location.id,
    version: 1,
    requestKey: randomUUID(),
    availability: 'AVAILABLE',
  });
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
async function pickedUp() {
  const order = await f.create();
  await f.confirm(order.id);
  const assigned = await f.a.primary.expect(
    `/orders/${order.id}/delivery`,
    'POST',
    await f.command(order.id, 'ASSIGNED', { courierUserId: f.courier.user.id }),
  );
  const ready = await f.ready(order.id),
    actor = await f.login();
  await actor.expect(`/courier-work/${order.id}/accept`, 'POST', {
    locationId: f.a.location.id,
    assignmentId: assigned.operation.id,
    orderVersion: ready.version,
    requestKey: randomUUID(),
    confirmed: true,
  });
  await actor.expect(
    `/orders/${order.id}/delivery`,
    'POST',
    await f.command(order.id, 'PICKED_UP'),
  );
  await actor.expect(
    `/orders/${order.id}/delivery`,
    'POST',
    await f.command(order.id, 'DELIVERING'),
  );
  return { order, actor };
}
it('delivery proof: explicit recipient/signature, own atomic delivery, replay, history and lost response resolution', async () => {
  const { order, actor } = await pickedUp(),
    path = `/orders/${order.id}/delivery`;
  const proof = {
    recipientName: 'Destinatar sintetic',
    confirmed: true,
    signature: [
      [
        { x: 0.1, y: 0.2 },
        { x: 0.7, y: 0.8 },
      ],
    ],
  };
  const body = await f.command(order.id, 'DELIVERED', { proof });
  const withoutProof = { version: body.version, requestKey: body.requestKey, status: body.status };
  expect((await actor.call(path, 'POST', withoutProof)).status).toBe(400);
  expect(
    (await actor.call(path, 'POST', { ...body, proof: { ...proof, confirmed: false } })).status,
  ).toBe(400);
  expect((await f.a.primary.call(path, 'POST', body)).status).toBe(403);
  expect((await f.b.primary.call(path, 'POST', body)).status).toBe(404);
  expect((await (await f.login(f.second.pin)).call(path, 'POST', body)).status).toBe(403);
  const [first, replay] = await Promise.all([
    actor.expect(path, 'POST', body),
    actor.expect(path, 'POST', body),
  ]);
  expect(replay.operation).toEqual(first.operation);
  expect(first.order.deliveryStatus).toBe('DELIVERED');
  expect(first.order.paymentSummary.outstandingAmount).toBe(first.order.total);
  const resolved = await actor.expect(`${path}/resolution`, 'POST', {
    locationId: f.a.location.id,
    requestKey: body.requestKey,
    status: 'DELIVERED',
  });
  expect(resolved.status).toBe('SUCCEEDED');
  expect(resolved.operation).toEqual(first.operation);
  expect(JSON.stringify(resolved)).not.toContain(proof.recipientName);
  const read = await actor.expect(`/courier-work/${order.id}?locationId=${f.a.location.id}`);
  expect(read.order.deliveryProof).toMatchObject({
    recipientName: proof.recipientName,
    confirmedAt: expect.any(String),
  });
  expect(JSON.stringify(read)).not.toContain('signature');
  expect(
    (
      await actor.call(path, 'POST', {
        ...body,
        proof: { ...proof, recipientName: 'Alt destinatar' },
      })
    ).status,
  ).toBe(409);
  expect((await f.a.primary.call(path, 'POST', body)).status).toBe(409);
  await f.a.primary.expect(`/staff/${f.courier.user.id}/overrides`, 'POST', {
    permission: 'delivery.update',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.login();
  expect(
    (
      await denied.call(`${path}/resolution`, 'POST', {
        locationId: f.a.location.id,
        requestKey: body.requestKey,
        status: 'DELIVERED',
      })
    ).status,
  ).toBe(403);
  expect(
    (await denied.call(`/courier-work/${order.id}?locationId=${f.a.location.id}`)).status,
  ).toBe(403);
});
