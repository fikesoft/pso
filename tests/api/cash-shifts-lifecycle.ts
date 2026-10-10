import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CashShiftsFixture } from './cash-shifts.types';

export async function verifyShiftOpenClose(f: CashShiftsFixture) {
  const actor = f.actors.cashier!.session;
  const opened = await f.open(actor, '100');
  const { shift, register } = opened;
  const archive = { locationId: f.locationId, version: register.version, requestKey: randomUUID() };
  expect(
    (await f.a.primary.call(`/cash-registers/${register.id}/archive`, 'POST', archive)).status,
  ).toBe(409);
  const body = {
    locationId: f.locationId,
    version: 1,
    requestKey: randomUUID(),
    countedCash: '99',
  };
  expect((await actor.call(`/cash-shifts/${shift.id}/close`, 'POST', body)).status).toBe(400);
  expect((await f.detail(shift.id, actor)).shift).toEqual(shift);
  const request = { ...body, discrepancyReason: 'Diferență constatată la numărare' };
  expect(
    (await actor.call(`/cash-shifts/${shift.id}/close`, 'POST', request, {}, false)).status,
  ).toBe(403);
  const response = await actor.call(`/cash-shifts/${shift.id}/close`, 'POST', request);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.data.shift).toMatchObject({
    status: 'CLOSED',
    version: 2,
    ownerUserId: shift.ownerUserId,
  });
  expect(response.data.closing).toMatchObject({
    expectedCash: '100.00',
    countedCash: '99.00',
    difference: '-1.00',
    discrepancyReason: request.discrepancyReason,
    managerReason: null,
  });
  expect(await actor.expect(`/cash-shifts/${shift.id}/close`, 'POST', request)).toEqual(
    response.data,
  );
  expect(
    (await actor.expect(`/cash-registers/${register.id}/open`, 'POST', opened.body)).shift,
  ).toEqual(shift);
  expect((await f.detail(shift.id, actor)).closing).toEqual(response.data.closing);
  await f.a.primary.expect(`/cash-registers/${register.id}/archive`, 'POST', archive);
  expect(
    (
      await actor.call(`/cash-registers/${register.id}/open`, 'POST', {
        ...opened.body,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
}

export async function verifyShiftManagerClose(f: CashShiftsFixture) {
  const own = f.actors.other!.session;
  const { shift } = await f.open(own, '10');
  const path = `/cash-shifts/${shift.id}/close`;
  const body = {
    locationId: f.locationId,
    requestKey: randomUUID(),
    version: shift.version,
    countedCash: '9',
  };
  expect(
    (
      await f.actors.cashier!.session.call(path, 'POST', {
        ...body,
        managerReason: 'Închidere la cererea managerului',
        discrepancyReason: 'Lipsă la numărare',
      })
    ).status,
  ).toBe(403);
  expect((await f.actors.closeOnly!.session.call(path, 'POST', body)).status).toBe(403);
  expect((await f.a.primary.call(path, 'POST', body)).status).toBe(400);
  expect(
    (
      await f.a.primary.call(path, 'POST', {
        ...body,
        managerReason: 'Casierul a încheiat programul',
      })
    ).status,
  ).toBe(400);
  const closed = await f.a.primary.expect(path, 'POST', {
    ...body,
    managerReason: 'Casierul a încheiat programul',
    discrepancyReason: 'Diferență observată la numărare',
  });
  expect(closed.shift.ownerUserId).toBe(f.actors.other!.userId);
  expect(closed.closing.closedByUserId).not.toBe(closed.shift.ownerUserId);
  expect(closed.closing).toMatchObject({
    expectedCash: '10.00',
    countedCash: '9.00',
    difference: '-1.00',
  });
  expect((await f.detail(shift.id, own)).closing).toEqual(closed.closing);
}

export async function verifyShiftRaces(f: CashShiftsFixture) {
  const actor = f.actors.cashier!.session;
  const register = await f.register();
  const body = { locationId: f.locationId, requestKey: randomUUID(), openingAmount: '0' };
  const path = `/cash-registers/${register.id}/open`;
  const concurrent = await Promise.all([
    actor.call(path, 'POST', body),
    actor.call(path, 'POST', { ...body, requestKey: randomUUID() }),
  ]);
  expect(concurrent.map((result) => result.status).sort()).toEqual([200, 409]);
  const shift = concurrent.find((result) => result.status === 200)!.data.shift;
  const close = {
    locationId: f.locationId,
    version: shift.version,
    requestKey: randomUUID(),
    countedCash: '0',
  };
  const results = await Promise.all([
    actor.call(`/cash-shifts/${shift.id}/close`, 'POST', close),
    actor.call(`/cash-shifts/${shift.id}/close`, 'POST', { ...close, requestKey: randomUUID() }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect((await f.detail(shift.id, actor)).shift.version).toBe(2);
  const racing = await f.register();
  const archive = { locationId: f.locationId, version: racing.version, requestKey: randomUUID() };
  const race = await Promise.all([
    actor.call(`/cash-registers/${racing.id}/open`, 'POST', { ...body, requestKey: randomUUID() }),
    f.a.primary.call(`/cash-registers/${racing.id}/archive`, 'POST', archive),
  ]);
  expect(race.map((result) => result.status).sort()).toEqual([200, 409]);
}
