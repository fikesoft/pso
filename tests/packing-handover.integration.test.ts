import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { preparePacking } from './api/packing-setup';
import type { PackingFixture } from './api/packing.types';
import { closeOperations } from './api/operations-setup';

let f: PackingFixture;
beforeAll(async () => {
  f = await preparePacking();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
async function pack(sessionId: string) {
  const { session } = await f.a.primary.expect(`/packing/sessions/${sessionId}`);
  const path = `/packing/sessions/${sessionId}/commands`;
  let version = session.version;
  await f.a.primary.expect(path, 'POST', {
    action: 'START',
    version: version++,
    requestKey: randomUUID(),
  });
  for (const item of session.items)
    await f.a.primary.expect(path, 'POST', {
      action: 'CHECK_ITEM',
      itemId: item.id,
      checked: true,
      version: version++,
      requestKey: randomUUID(),
    });
  const complete = { action: 'COMPLETE', version, requestKey: randomUUID() };
  const result = await f.a.primary.expect(path, 'POST', complete);
  expect(await f.a.primary.expect(path, 'POST', complete)).toEqual(result);
}

it('predare: bucătăria gata nu permite checkout; ambalarea schimbă atomic statusul și cronologia', async () => {
  const { order, session } = await f.create();
  const read = () => f.a.primary.expect(`/orders/${order.id}`);
  const prepared = (await read()).order;
  expect(prepared).toMatchObject({
    status: 'IN_PROGRESS',
    kitchenStatus: 'READY',
    packingStatus: 'WAITING',
  });
  const command = { version: prepared.version, requestKey: randomUUID() };
  const shift = await f.cashShift();
  expect((await f.a.primary.call(`/orders/${order.id}/complete`, 'POST', command)).status).toBe(
    409,
  );
  expect(
    (await f.a.primary.call(`/orders/${order.id}/checkout/demo`, 'POST', command)).status,
  ).toBe(409);
  expect(
    (
      await f.a.primary.call(`/orders/${order.id}/checkout/manual`, 'POST', {
        ...command,
        cashShiftId: shift.id,
        method: 'CARD',
        confirmed: true,
      })
    ).status,
  ).toBe(409);
  expect((await read()).order.version).toBe(prepared.version);
  await pack(session.id);
  const ready = (await read()).order;
  expect(ready).toMatchObject({
    status: 'READY',
    packingStatus: 'READY',
    version: prepared.version + 1,
    total: prepared.total,
  });
  const timeline = await f.a.primary.expect(`/orders/${order.id}/timeline`);
  expect(
    timeline.events
      .filter((event: { kind: string }) => event.kind === 'PACKING')
      .map((event: { toStatus: string }) => event.toStatus),
  ).toEqual(['READY', 'PACKING']);
  const finished = await f.a.primary.expect(`/orders/${order.id}/checkout/demo`, 'POST', {
    version: ready.version,
    requestKey: randomUUID(),
  });
  expect(finished.order).toMatchObject({ status: 'COMPLETED', packingStatus: 'READY' });
});

it('predare: plata în avans este independentă, dar curierul preia numai după verificare', async () => {
  const { order, session } = await f.create({ serviceType: 'DELIVERY' });
  const read = () => f.a.primary.expect(`/orders/${order.id}`);
  const prepared = (await read()).order;
  const { couriers } = await f.a.primary.expect(`/orders/${order.id}/delivery-couriers`);
  expect(couriers.length).toBeGreaterThan(0);
  const assigned = await f.a.primary.expect(`/orders/${order.id}/delivery`, 'POST', {
    version: prepared.version,
    requestKey: randomUUID(),
    status: 'ASSIGNED',
    courierUserId: couriers[0].id,
  });
  expect(
    (
      await f.a.primary.call(`/orders/${order.id}/delivery`, 'POST', {
        version: assigned.order.version,
        requestKey: randomUUID(),
        status: 'PICKED_UP',
      })
    ).status,
  ).toBe(409);
  const paid = await f.a.primary.expect(`/orders/${order.id}/payments`, 'POST', {
    version: assigned.order.version,
    requestKey: randomUUID(),
    confirmed: true,
    cashShiftId: (await f.cashShift()).id,
    payments: [{ method: 'CARD', amount: prepared.total }],
  });
  expect(paid.order).toMatchObject({
    status: 'IN_PROGRESS',
    packingStatus: 'WAITING',
    paymentStatus: 'PAID',
  });
  await pack(session.id);
  const ready = (await read()).order;
  const picked = await f.a.primary.expect(`/orders/${order.id}/delivery`, 'POST', {
    version: ready.version,
    requestKey: randomUUID(),
    status: 'PICKED_UP',
  });
  const finished = await f.a.primary.expect(`/orders/${order.id}/complete`, 'POST', {
    version: picked.order.version,
    requestKey: randomUUID(),
  });
  expect(finished.order).toMatchObject({
    status: 'COMPLETED',
    packingStatus: 'READY',
    deliveryStatus: 'PICKED_UP',
    paymentStatus: 'PAID',
  });
});
