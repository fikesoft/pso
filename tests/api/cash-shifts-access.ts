import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CashShiftsFixture } from './cash-shifts.types';

export async function verifyShiftAccess(f: CashShiftsFixture) {
  const cashier = f.actors.cashier!.session;
  const register = await f.register();
  const body = { locationId: f.locationId, requestKey: randomUUID(), openingAmount: '10' };
  const path = `/cash-registers/${register.id}/open`;
  for (const name of ['reader', 'closeOnly', 'denied'])
    expect((await f.actors[name]!.session.call(path, 'POST', body)).status).toBe(403);
  expect((await cashier.call(path, 'POST', body, {}, false)).status).toBe(403);
  expect((await cashier.call(path, 'POST', body, { origin: 'http://127.0.0.1:9' })).status).toBe(
    403,
  );
  expect(
    (await f.actors.limited!.session.call(path, 'POST', { ...body, openingAmount: '10.01' }))
      .status,
  ).toBe(403);
  const opened = await cashier.call(path, 'POST', body);
  expect(opened.status).toBe(200);
  expect(opened.headers.get('cache-control')).toBe('no-store');
  expect(opened.data.shift).toMatchObject({
    ownerUserId: f.actors.cashier!.userId,
    openingAmount: '10.00',
    status: 'OPEN',
    version: 1,
  });
  expect(opened.data.shift).not.toHaveProperty('organizationId');
  const detailPath = `/cash-shifts/${opened.data.shift.id}?locationId=${f.locationId}`;
  const read = await cashier.call(detailPath);
  expect(read.status).toBe(200);
  expect(read.headers.get('cache-control')).toBe('no-store');
  expect((await f.actors.other!.session.call(detailPath)).status).toBe(403);
  expect((await f.actors.closeOnly!.session.call(detailPath)).status).toBe(403);
  expect(
    (await f.b.primary.call(`/cash-shifts/${opened.data.shift.id}?locationId=${f.b.location.id}`))
      .status,
  ).toBe(404);
  const foreign = await f.register(f.otherLocation.id);
  expect(
    (
      await cashier.call(`/cash-registers/${foreign.id}/open`, 'POST', {
        ...body,
        locationId: f.otherLocation.id,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.a.primary.call(`/cash-registers/${foreign.id}/open`, 'POST', {
        ...body,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(404);
  expect(
    (await cashier.call(path, 'POST', { ...body, ownerUserId: f.actors.other!.userId })).status,
  ).toBe(400);
  const allowed = await f.open(f.actors.limited!.session, '10');
  expect(allowed.shift.openingAmount).toBe('10.00');
}

export async function verifyShiftLimits(f: CashShiftsFixture) {
  for (const permission of [
    'cash.shifts.read',
    'cash.shifts.close',
    'cash.shifts.close-others',
    'cash.reports.read',
  ]) {
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
          await f.a.primary.call(`/staff/${f.actors.reader!.userId}/overrides`, 'POST', {
            permission,
            effect: 'ALLOW',
            scopeType: 'LOCATION',
            locationId: f.locationId,
            limits,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await f.a.primary.call('/delegations', 'POST', {
            userId: f.actors.reader!.userId,
            scopeType: 'LOCATION',
            locationId: f.locationId,
            permissions: [{ permission, limits }],
          })
        ).status,
      ).toBe(400);
    }
  }
  expect(
    (
      await f.a.primary.call('/roles', 'POST', {
        name: 'Invalid procent OPEN',
        permissions: [{ permission: 'cash.shifts.open', limits: { maxPercent: '1' } }],
      })
    ).status,
  ).toBe(400);
}

export async function verifyShiftList(f: CashShiftsFixture) {
  const actor = f.actors.other!.session;
  const first = await f.open(actor, '0');
  const second = await f.open(actor, '1');
  const query = `/cash-shifts?locationId=${f.locationId}`;
  const mine = await actor.expect(query);
  expect(
    mine.shifts.every(
      (shift: { ownerUserId: string; status: string }) =>
        shift.ownerUserId === f.actors.other!.userId && shift.status === 'OPEN',
    ),
  ).toBe(true);
  expect(mine.shifts.map((shift: { id: string }) => shift.id)).toEqual(
    expect.arrayContaining([first.shift.id, second.shift.id]),
  );
  expect((await actor.call(`${query}&view=ALL`)).status).toBe(403);
  const all = await f.a.primary.expect(`${query}&view=ALL&limit=1`);
  expect(all.shifts).toHaveLength(1);
  expect(all.nextCursor).toBeTypeOf('string');
  const next = await f.a.primary.expect(
    `${query}&view=ALL&limit=1&cursor=${encodeURIComponent(all.nextCursor)}`,
  );
  expect(next.shifts[0].id).not.toBe(all.shifts[0].id);
  for (const changed of [
    'view=MINE',
    'view=ALL&status=CLOSED',
    `view=ALL&registerId=${first.register.id}`,
  ])
    expect(
      (
        await f.a.primary.call(
          `${query}&${changed}&limit=1&cursor=${encodeURIComponent(all.nextCursor)}`,
        )
      ).status,
    ).toBe(400);
  expect((await actor.call(`${query}&limit=101`)).status).toBe(400);
  expect((await actor.call(`/cash-shifts?locationId=${f.otherLocation.id}`)).status).toBe(403);
  expect(
    (await f.a.primary.expect(`${query}&view=ALL&registerId=${second.register.id}`)).shifts,
  ).toHaveLength(1);
}
