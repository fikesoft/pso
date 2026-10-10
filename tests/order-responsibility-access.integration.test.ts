import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOrderResponsibilities } from './api/order-responsibilities-setup';
import { closeOperations } from './api/operations-setup';
import type { ResponsibilityFixture } from './api/order-responsibilities.types';

let f: ResponsibilityFixture;
beforeAll(async () => {
  f = await prepareOrderResponsibilities();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('responsabilitate acces: grant explicit și orders.read pe total, fără autoritate implicită din reports', async () => {
  const limited = f.responsibilityActors.limited!.session;
  const noHandoff = f.responsibilityActors.noHandoff!.session;
  const own = await f.open(limited, '0');
  const plain = await f.open(noHandoff, '0');
  const payout = await f.open();
  const order = await f.order(false, '20');
  const paid = await f.a.primary.expect(`/orders/${order.id}/payments`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
    cashShiftId: payout.shift.id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '19' }],
  });
  const body = {
    locationId: f.locationId,
    kind: 'ASSIGN',
    targetShiftId: own.shift.id,
    orderVersion: paid.order.version,
    responsibilityVersion: 0,
    requestKey: randomUUID(),
    reason: 'Asumare peste plafonul de citire',
  };
  const path = `/orders/${order.id}/responsibility-commands`;
  expect((await limited.call(path, 'POST', body)).status).toBe(403);
  expect(
    (await limited.call(`/orders/${order.id}/responsibility?locationId=${f.locationId}`)).status,
  ).toBe(403);
  expect((await f.queue({}, limited)).orders).toEqual([]);
  expect(
    (await noHandoff.call(path, 'POST', { ...body, targetShiftId: plain.shift.id })).status,
  ).toBe(403);
  const reporter = f.responsibilityActors.reporter!.session;
  expect(
    (await reporter.call(`/order-responsibilities?locationId=${f.locationId}&view=UNASSIGNED`))
      .status,
  ).toBe(403);
  expect(
    (await reporter.call(`/orders/${order.id}/responsibility-events?locationId=${f.locationId}`))
      .status,
  ).toBe(403);
  expect((await f.current(order.id)).responsibility.version).toBe(0);
});

it('responsabilitate acces: CSRF/Origin/no-store și scope strict nu sunt înlocuite de versiuni sau FK', async () => {
  const actor = f.responsibilityActors.outgoing!.session;
  const { shift } = await f.open(actor, '0');
  const order = await f.order();
  const body = {
    locationId: f.locationId,
    kind: 'ASSIGN',
    targetShiftId: shift.id,
    orderVersion: order.version,
    responsibilityVersion: 0,
    requestKey: randomUUID(),
    reason: 'Asumare autorizată',
  };
  const path = `/orders/${order.id}/responsibility-commands`;
  expect((await actor.call(path, 'POST', body, {}, false)).status).toBe(403);
  expect((await actor.call(path, 'POST', body, { origin: 'http://127.0.0.1:9' })).status).toBe(403);
  expect((await actor.call(path, 'POST', body, { 'idempotency-key': randomUUID() })).status).toBe(
    400,
  );
  expect(
    (await f.b.primary.call(path, 'POST', { ...body, locationId: f.b.location.id })).status,
  ).toBe(404);
  expect(
    (await f.a.primary.call(path, 'POST', { ...body, locationId: f.otherLocation.id })).status,
  ).toBe(404);
  const result = await actor.call(path, 'POST', body);
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('no-store');
  const read = await actor.call(`/orders/${order.id}/responsibility?locationId=${f.locationId}`);
  expect(read.status).toBe(200);
  expect(read.headers.get('cache-control')).toBe('no-store');
  for (const key of ['phone', 'address', 'customer', 'items'])
    expect(JSON.stringify(read.data)).not.toContain(`"${key}"`);
});

it('responsabilitate acces: plafoanele handoff sunt refuzate în toate formele de atribuire', async () => {
  for (const permission of ['orders.handoff', 'orders.handoff-others'])
    for (const limits of [{ maxAmount: '1' }, { maxPercent: '1' }]) {
      expect(
        (
          await f.a.primary.call('/roles', 'POST', {
            name: `Invalid ${randomUUID()}`,
            permissions: [{ permission, limits }],
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await f.a.primary.call(
            `/staff/${f.responsibilityActors.noHandoff!.userId}/overrides`,
            'POST',
            {
              permission,
              limits,
              effect: 'ALLOW',
              scopeType: 'LOCATION',
              locationId: f.locationId,
            },
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await f.a.primary.call('/delegations', 'POST', {
            userId: f.responsibilityActors.noHandoff!.userId,
            scopeType: 'LOCATION',
            locationId: f.locationId,
            permissions: [{ permission, limits }],
          })
        ).status,
      ).toBe(400);
    }
});

it('responsabilitate eligibilitate: DRAFT, total0, PAID și DEMO nu devin datorii asumate', async () => {
  const actor = f.responsibilityActors.outgoing!.session;
  const { shift } = await f.open(actor, '0');
  const draft = (await f.a.primary.expect('/orders', 'POST', f.draft())).order;
  const zero = await f.order(false, '0');
  const paid = await f.order(false, '10');
  const payout = await f.open();
  const settled = await f.a.primary.expect(`/orders/${paid.id}/payments`, 'POST', {
    version: paid.version,
    requestKey: randomUUID(),
    cashShiftId: payout.shift.id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '10' }],
  });
  const ready = await f.order(true, '10');
  const demo = await f.a.primary.expect(`/orders/${ready.id}/checkout/demo`, 'POST', {
    version: ready.version,
    requestKey: randomUUID(),
  });
  for (const order of [draft, zero, settled.order, demo.order]) {
    const result = await actor.call(`/orders/${order.id}/responsibility-commands`, 'POST', {
      locationId: f.locationId,
      kind: 'ASSIGN',
      targetShiftId: shift.id,
      orderVersion: order.version,
      responsibilityVersion: 0,
      requestKey: randomUUID(),
      reason: 'Încercare neeligibilă',
    });
    expect(result.status).toBe(409);
    expect(result.data.code).toBe('ORDER_RESPONSIBILITY_NOT_ELIGIBLE');
    expect((await f.history(order.id)).events).toEqual([]);
  }
});

it('responsabilitate readonly: rândurile neasumate și proprii rămân lizibile fără autoritate de mutație', async () => {
  let actor = await f.responsibilityLogin('noHandoff');
  const record = f.responsibilityActors.noHandoff!;
  const { shift } = await f.open(actor, '0');
  const order = await f.order(false, '5');
  const unassigned = await f.current(order.id, actor);
  expect(unassigned.actions).toEqual({ assign: false, prepare: false, accept: false });
  expect(
    (await f.queue({}, actor)).orders.map((row: { order: { id: string } }) => row.order.id),
  ).toContain(order.id);
  const grant = await f.a.primary.expect(`/staff/${record.userId}/overrides`, 'POST', {
    permission: 'orders.handoff',
    effect: 'ALLOW',
    scopeType: 'LOCATION',
    locationId: f.locationId,
  });
  actor = await f.responsibilityLogin('noHandoff');
  await f.assign(order.id, shift.id, actor);
  await f.a.primary.expect(`/staff/${record.userId}/overrides/${grant.override.id}`, 'DELETE', {});
  actor = await f.responsibilityLogin('noHandoff');
  const own = await f.queue({ view: 'ASSIGNED', shiftId: shift.id }, actor);
  expect(own.orders).toHaveLength(1);
  expect(own.orders[0].actions).toEqual({ assign: false, prepare: false, accept: false });
  expect((await f.current(order.id, actor)).responsibility.owner.userId).toBe(record.userId);
  expect((await f.history(order.id, actor)).events).toHaveLength(1);
});
