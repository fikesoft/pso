import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareDelivery } from './api/delivery-setup';
import type { DeliveryFixture } from './api/delivery.types';
import { closeOperations } from './api/operations-setup';
let f: DeliveryFixture;
beforeAll(async () => {
  f = await prepareDelivery();
  for (const user of [f.courier, f.second]) {
    const id = randomUUID();
    await f.a.primary.expect(`/couriers/${id}/commands`, 'POST', {
      action: 'CREATE',
      locationId: f.a.location.id,
      userId: user.user.id,
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
  }
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
async function assigned() {
  const order = await f.create();
  await f.confirm(order.id);
  const result = await f.a.primary.expect(
    `/orders/${order.id}/delivery`,
    'POST',
    await f.command(order.id, 'ASSIGNED', { courierUserId: f.courier.user.id }),
  );
  return {
    order: result.order,
    body: {
      locationId: f.a.location.id,
      assignmentId: result.operation.id,
      orderVersion: result.order.version,
      requestKey: randomUUID(),
      confirmed: true,
    },
  };
}
it('courier acceptance: explicit confirmation, single acceptance, replay and pickup gate', async () => {
  const { order, body } = await assigned(),
    actor = await f.login(),
    path = `/courier-work/${order.id}/accept`;
  expect((await actor.call(path, 'POST', { ...body, confirmed: false })).status).toBe(400);
  expect((await actor.call(path, 'POST', { ...body, orderVersion: 1 })).status).toBe(409);
  expect((await (await f.login(f.second.pin)).call(path, 'POST', body)).status).toBe(404);
  const ready = await f.ready(order.id);
  expect(
    (
      await actor.call(
        `/orders/${order.id}/delivery`,
        'POST',
        await f.command(order.id, 'PICKED_UP'),
      )
    ).status,
  ).toBe(409);
  const request = { ...body, orderVersion: ready.version };
  const [first, replay] = await Promise.all([
    actor.expect(path, 'POST', request),
    actor.expect(path, 'POST', request),
  ]);
  expect(first).toEqual(replay);
  expect(first.order).toMatchObject({
    acceptedAt: first.result.acceptedAt,
    orderVersion: ready.version,
    deliveryStatus: 'ASSIGNED',
    outstandingAmount: ready.total,
  });
  expect((await actor.call(path, 'POST', { ...request, requestKey: randomUUID() })).status).toBe(
    409,
  );
  expect((await actor.call(path, 'POST', { ...request, orderVersion: 1 })).status).toBe(409);
  await actor.expect(
    `/orders/${order.id}/delivery`,
    'POST',
    await f.command(order.id, 'PICKED_UP'),
  );
  const later = await actor.expect(path, 'POST', request);
  expect(later.result).toEqual(first.result);
  expect(later.order.deliveryStatus).toBe('PICKED_UP');
  expect(later.order.orderVersion).toBeGreaterThan(first.result.orderVersion);
  const resolved = await actor.expect(`${path}/resolution`, 'POST', {
    locationId: body.locationId,
    assignmentId: body.assignmentId,
    requestKey: body.requestKey,
  });
  expect(resolved.status).toBe('SUCCEEDED');
  expect(resolved.result).toEqual(first.result);
});
it('courier acceptance: terminal retirement and assignment isolation', async () => {
  const { order, body } = await assigned(),
    actor = await f.login(),
    path = `/courier-work/${order.id}/accept`;
  const pointer = {
    locationId: body.locationId,
    assignmentId: body.assignmentId,
    requestKey: body.requestKey,
  };
  expect((await actor.expect(`${path}/resolution`, 'POST', pointer)).status).toBe('RETIRED');
  expect((await actor.call(path, 'POST', body)).status).toBe(409);
  expect(
    (await actor.call(`${path}/resolution`, 'POST', { ...pointer, locationId: f.otherLocation.id }))
      .status,
  ).toBe(403);
  expect(
    (await actor.call(path, 'POST', { ...body, requestKey: randomUUID() }, {}, false)).status,
  ).toBe(403);
  await f.a.primary.expect(
    `/orders/${order.id}/delivery`,
    'POST',
    await f.command(order.id, 'ASSIGNED', {
      courierUserId: f.second.user.id,
      reason: 'Schimb de tură',
    }),
  );
  expect((await actor.call(path, 'POST', { ...body, requestKey: randomUUID() })).status).toBe(404);
  expect((await actor.call(`${path}/resolution`, 'POST', pointer)).status).toBe(404);
  const second = await f.login(f.second.pin);
  expect((await second.call(path, 'POST', { ...body, requestKey: randomUUID() })).status).toBe(404);
});
it('courier acceptance: current DENY blocks replay and resolution', async () => {
  const { order, body } = await assigned(),
    actor = await f.login(),
    path = `/courier-work/${order.id}/accept`;
  await actor.expect(path, 'POST', body);
  await f.a.primary.expect(`/staff/${f.courier.user.id}/overrides`, 'POST', {
    permission: 'delivery.update',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.login();
  expect((await denied.call(path, 'POST', body)).status).toBe(403);
  expect(
    (
      await denied.call(`${path}/resolution`, 'POST', {
        locationId: body.locationId,
        assignmentId: body.assignmentId,
        requestKey: body.requestKey,
      })
    ).status,
  ).toBe(403);
});
