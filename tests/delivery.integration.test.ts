import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareDelivery } from './api/delivery-setup';
import type { DeliveryFixture } from './api/delivery.types';
import { closeOperations } from './api/operations-setup';
import { db, noSecrets } from './api/support/harness';

let f: DeliveryFixture;
beforeAll(async () => {
  f = await prepareDelivery();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('tracks delivery independently through PIN pickup, completion, payment and replay', async () => {
  const order = await f.create();
  const path = `/orders/${order.id}/delivery`;
  expect(order.deliveryStatus).toBe('WAITING_COURIER');
  const draftBody = await f.command(order.id, 'ASSIGNED', { courierUserId: f.courier.user.id });
  expect((await f.a.primary.call(path, 'POST', draftBody)).status).toBe(409);
  await f.confirm(order.id);
  const couriers = await f.a.primary.expect(`/orders/${order.id}/delivery-couriers`);
  noSecrets(couriers);
  expect(couriers.couriers.map((c: { id: string }) => c.id)).toContain(f.courier.user.id);
  expect(couriers.couriers.map((c: { id: string }) => c.id)).not.toContain(f.outside.user.id);
  const body = await f.command(order.id, 'ASSIGNED', { courierUserId: f.courier.user.id });
  const [a, b] = await Promise.all([
    f.a.primary.expect(path, 'POST', body),
    f.a.primary.expect(path, 'POST', body),
  ]);
  expect(a).toEqual(b);
  expect(a.order).toMatchObject({
    status: 'CONFIRMED',
    deliveryStatus: 'ASSIGNED',
    paymentStatus: 'UNPAID',
  });
  expect(
    (await f.a.primary.call(path, 'POST', { ...body, courierUserId: f.second.user.id })).status,
  ).toBe(409);
  const actor = await f.login();
  const pickup = await f.command(order.id, 'PICKED_UP');
  expect((await actor.call(path, 'POST', pickup)).status).toBe(409);
  const ready = await f.ready(order.id);
  expect((await actor.expect(path)).canUpdate).toBe(true);
  await actor.expect(path, 'POST', { ...pickup, version: ready.version });
  const completed = await f.a.primary.expect(`/orders/${order.id}/complete`, 'POST', {
    version: (await f.current(order.id)).version,
    requestKey: randomUUID(),
  });
  expect(completed.order).toMatchObject({
    status: 'COMPLETED',
    deliveryStatus: 'PICKED_UP',
    paymentStatus: 'UNPAID',
  });
  await actor.expect(path, 'POST', await f.command(order.id, 'DELIVERING'));
  const deliveredBody = await f.command(order.id, 'DELIVERED');
  const delivered = await actor.expect(path, 'POST', deliveredBody);
  expect(delivered.operation.actorUserId).toBe(f.courier.user.id);
  expect(delivered.order).toMatchObject({
    status: 'COMPLETED',
    deliveryStatus: 'DELIVERED',
    paymentStatus: 'UNPAID',
  });
  expect((await f.stored(order.id)).payments).toBe(0);
  const before = await f.stored(order.id);
  await f.a.primary.expect(`/orders/${order.id}/payments`, 'POST', {
    version: delivered.order.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: delivered.order.total }],
  });
  const replay = await actor.expect(path, 'POST', deliveredBody);
  expect(replay.operation).toEqual(delivered.operation);
  expect(replay.order.paymentStatus).toBe('PAID');
  const after = await f.stored(order.id);
  expect(after.documents).toBe(before.documents);
  expect(after.events.filter((e) => e.kind === 'DELIVERY')).toHaveLength(4);
  const history = await actor.expect(path);
  expect(history.operations).toHaveLength(4);
  expect(history.operations[0].toStatus).toBe('DELIVERED');
  noSecrets(history);
  expect(
    (
      await actor.call(
        path,
        'POST',
        await f.command(order.id, 'FAILED', { reason: 'Stare terminală' }),
      )
    ).status,
  ).toBe(409);
});

it('requires reasons, rejects stale versions and safely reassigns, fails and resumes', async () => {
  const order = await f.create();
  await f.confirm(order.id);
  const path = `/orders/${order.id}/delivery`;
  await f.a.primary.expect(
    path,
    'POST',
    await f.command(order.id, 'ASSIGNED', { courierUserId: f.courier.user.id }),
  );
  const reassignment = await f.command(order.id, 'ASSIGNED', { courierUserId: f.second.user.id });
  expect((await f.a.primary.call(path, 'POST', reassignment)).status).toBe(400);
  await f.a.primary.expect(path, 'POST', { ...reassignment, reason: 'Schimb de tură' });
  const oldCourier = await f.login();
  expect(
    (
      await oldCourier.call(
        path,
        'POST',
        await f.command(order.id, 'FAILED', { reason: 'Curier vechi' }),
      )
    ).status,
  ).toBe(403);
  const actor = await f.login(f.second.pin);
  const failedBody = await f.command(order.id, 'FAILED', { reason: 'Client indisponibil' });
  expect((await actor.call(path, 'POST', { ...failedBody, version: 1 })).status).toBe(409);
  const failed = await actor.expect(path, 'POST', failedBody);
  expect(failed.order.deliveryCourierId).toBe(f.second.user.id);
  const resume = await f.command(order.id, 'WAITING_COURIER', { reason: 'Clientul a revenit' });
  expect((await actor.call(path, 'POST', resume)).status).toBe(403);
  const waiting = await f.a.primary.expect(path, 'POST', resume);
  expect(waiting.order).toMatchObject({
    deliveryStatus: 'WAITING_COURIER',
    deliveryCourierId: null,
  });
  expect(waiting.operation.previousCourierId).toBe(f.second.user.id);
  const assignBody = await f.command(order.id, 'ASSIGNED', { courierUserId: f.courier.user.id });
  const failBody = await f.command(order.id, 'FAILED', { reason: 'Anulare cursă' });
  expect(assignBody.version).toBe(failBody.version);
  const results = await Promise.all([
    f.a.primary.call(path, 'POST', assignBody),
    f.a.primary.call(path, 'POST', failBody),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const state = await f.current(order.id);
  if (state.deliveryStatus === 'ASSIGNED') {
    expect(
      (
        await f.a.primary.call(`/orders/${order.id}/cancel`, 'POST', {
          version: state.version,
          requestKey: randomUUID(),
          reason: 'Curier activ',
        })
      ).status,
    ).toBe(409);
    await f.a.primary.expect(
      path,
      'POST',
      await f.command(order.id, 'FAILED', { reason: 'Cursa oprită' }),
    );
  }
  await f.a.primary.expect(`/orders/${order.id}/cancel`, 'POST', {
    version: (await f.current(order.id)).version,
    requestKey: randomUUID(),
    reason: 'Comanda anulată',
  });
  expect(
    (
      await f.a.primary.call(
        path,
        'POST',
        await f.command(order.id, 'WAITING_COURIER', { reason: 'Nu se reia' }),
      )
    ).status,
  ).toBe(409);
  const audit = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    (tx) =>
      tx.auditEvent.count({ where: { action: 'delivery.updated', locationId: f.a.location.id } }),
  );
  expect(audit).toBeGreaterThan(0);
});

it('rejects non-delivery and DEMO orders and validates location-bound history cursors', async () => {
  const pickup = await f.create('PICKUP');
  expect(pickup.deliveryStatus).toBe('NOT_REQUIRED');
  await f.confirm(pickup.id);
  expect(
    (
      await f.a.primary.call(
        `/orders/${pickup.id}/delivery`,
        'POST',
        await f.command(pickup.id, 'ASSIGNED', { courierUserId: f.courier.user.id }),
      )
    ).status,
  ).toBe(409);
  const order = await f.create();
  await f.ready(order.id);
  await f.a.primary.expect(`/orders/${order.id}/checkout/demo`, 'POST', {
    version: (await f.current(order.id)).version,
    requestKey: randomUUID(),
  });
  expect(
    (
      await f.a.primary.call(
        `/orders/${order.id}/delivery`,
        'POST',
        await f.command(order.id, 'ASSIGNED', { courierUserId: f.courier.user.id }),
      )
    ).status,
  ).toBe(409);
  expect(
    (await f.a.primary.call(`/orders/${order.id}/delivery?cursor=${randomUUID()}`)).status,
  ).toBe(400);
});
