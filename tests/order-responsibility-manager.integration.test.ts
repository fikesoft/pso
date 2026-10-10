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

it('responsabilitate manager: PREPARE-only cere MFA, reports și motiv managerial independent', async () => {
  const outgoing = f.responsibilityActors.outgoing!.session;
  const { shift } = await f.open(outgoing, '0');
  const order = await f.order();
  await f.assign(order.id, shift.id);
  const path = `/orders/${order.id}/responsibility-commands`;
  const body = {
    locationId: f.locationId,
    kind: 'PREPARE_HANDOFF',
    sourceShiftId: shift.id,
    orderVersion: order.version,
    responsibilityVersion: 1,
    requestKey: randomUUID(),
    reason: 'Predare operațională documentată',
    managerReason: 'Recuperare de către manager',
  };
  const managerRecord = f.responsibilityActors.manager!;
  expect((await managerRecord.session.call(path, 'POST', body)).status).toBe(403);
  for (const name of ['manager', 'noReports', 'closeManager'])
    f.responsibilityActors[name]!.secret = await f.responsibilityActors[name]!.session.enroll();
  const manager = managerRecord.session;
  expect((await f.responsibilityActors.noReports!.session.call(path, 'POST', body)).status).toBe(
    403,
  );
  expect((await f.responsibilityActors.closeManager!.session.call(path, 'POST', body)).status).toBe(
    403,
  );
  expect((await manager.call(path, 'POST', { ...body, managerReason: undefined })).status).toBe(
    400,
  );
  expect((await outgoing.call(path, 'POST', body)).status).toBe(400);
  expect(
    (
      await manager.call(path, 'POST', {
        locationId: f.locationId,
        kind: 'ASSIGN',
        targetShiftId: shift.id,
        orderVersion: order.version,
        responsibilityVersion: 1,
        requestKey: randomUUID(),
        reason: 'Nu atribuie altui owner',
      })
    ).status,
  ).toBe(403);
  const query = `/order-responsibilities?locationId=${f.locationId}&view=ASSIGNED&shiftId=${shift.id}`;
  expect((await f.responsibilityActors.noReports!.session.call(query)).status).toBe(403);
  expect((await f.responsibilityActors.closeManager!.session.call(query)).status).toBe(403);
  expect((await manager.expect(query)).orders).toHaveLength(1);
  const result = await manager.expect(path, 'POST', body);
  expect(result.event).toMatchObject({
    actorUserId: managerRecord.userId,
    fromOwner: { userId: f.responsibilityActors.outgoing!.userId },
    toOwner: { userId: f.responsibilityActors.outgoing!.userId },
    managerReason: body.managerReason,
    reason: body.reason,
  });
});

it('responsabilitate manager: owner dezactivat se predă fără reactivare, incoming acceptă snapshotul istoric', async () => {
  const outgoing = await f.responsibilityLogin('outgoing');
  const record = f.responsibilityActors.outgoing!;
  const { shift, register } = await f.open(outgoing, '0');
  const order = await f.order();
  await f.assign(order.id, shift.id, outgoing);
  const users = (await f.a.primary.expect('/staff')).users;
  const user = users.find((value: { id: string }) => value.id === record.userId);
  await f.a.primary.expect(`/staff/${record.userId}`, 'PATCH', {
    version: user.version,
    status: 'DISABLED',
  });
  expect((await outgoing.call('/context')).status).toBe(401);
  const manager = await f.responsibilityLogin('manager');
  const result = await f.prepare(order.id, shift.id, manager, {
    managerReason: 'Recuperarea turei unui cont dezactivat',
  });
  expect(result.event.fromOwner.userId).toBe(record.userId);
  await f.close(shift.id, f.a.primary, { managerReason: 'Închidere după predarea durabilă' });
  const incoming = await f.responsibilityLogin('incoming');
  const target = await f.openRegister(register.id, incoming);
  await f.command(
    order.id,
    { kind: 'ACCEPT_HANDOFF', targetShiftId: target.id, handoffEventId: result.event.eventId },
    incoming,
  );
  expect((await f.current(order.id)).responsibility.owner.userId).toBe(
    f.responsibilityActors.incoming!.userId,
  );
  expect(
    (await f.a.primary.expect('/staff')).users.find(
      (value: { id: string }) => value.id === record.userId,
    ).status,
  ).toBe('DISABLED');
});
