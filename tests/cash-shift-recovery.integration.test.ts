import { verifyRefundResolution } from './api/cash-shifts-refund-recovery';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareCashShifts } from './api/cash-shifts-setup';
import { closeOperations } from './api/operations-setup';
import type { CashShiftsFixture } from './api/cash-shifts.types';

let f: CashShiftsFixture;
beforeAll(async () => {
  f = await prepareCashShifts();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('recovery OPEN/CLOSE: snapshot confirmat, identitate strictă și retragere terminală înainte de commit', async () => {
  const actor = f.actors.cashier!.session;
  const opened = await f.open(actor, '0');
  const identity = {
    kind: 'OPEN',
    locationId: f.locationId,
    requestKey: opened.body.requestKey,
    registerId: opened.register.id,
  };
  const resolved = await actor.call('/cash-commands/resolution', 'POST', identity);
  expect(resolved.status).toBe(200);
  expect(resolved.headers.get('cache-control')).toBe('no-store');
  expect(resolved.data).toEqual({
    status: 'SUCCEEDED',
    command: identity,
    result: { shift: opened.shift },
  });
  expect(
    (await f.actors.other!.session.call('/cash-commands/resolution', 'POST', identity)).status,
  ).toBe(409);
  const closed = await f.close(opened.shift.id, actor);
  expect(await actor.expect('/cash-commands/resolution', 'POST', identity)).toEqual(resolved.data);
  const closing = {
    kind: 'CLOSE',
    locationId: f.locationId,
    requestKey: closed.body.requestKey,
    shiftId: opened.shift.id,
  };
  expect(await actor.expect('/cash-commands/resolution', 'POST', closing)).toEqual({
    status: 'SUCCEEDED',
    command: closing,
    result: { shift: closed.shift, closing: closed.closing },
  });
  const target = await f.register();
  const unknown = {
    kind: 'OPEN',
    locationId: f.locationId,
    requestKey: randomUUID(),
    registerId: target.id,
  };
  const retired = await actor.expect('/cash-commands/resolution', 'POST', unknown);
  expect(retired).toEqual({ status: 'RETIRED', command: unknown });
  expect(await actor.expect('/cash-commands/resolution', 'POST', unknown)).toEqual(retired);
  const delayed = await actor.call(`/cash-registers/${target.id}/open`, 'POST', {
    locationId: f.locationId,
    requestKey: unknown.requestKey,
    openingAmount: '0',
  });
  expect(delayed.status).toBe(409);
  expect(delayed.data.code).toBe('CASH_COMMAND_RETIRED');
  const stillOpen = await f.open(actor, '0');
  const neverClose = {
    kind: 'CLOSE',
    locationId: f.locationId,
    requestKey: randomUUID(),
    shiftId: stillOpen.shift.id,
  };
  expect((await actor.expect('/cash-commands/resolution', 'POST', neverClose)).status).toBe(
    'RETIRED',
  );
  expect(
    (
      await actor.call(`/cash-shifts/${stillOpen.shift.id}/close`, 'POST', {
        locationId: f.locationId,
        requestKey: neverClose.requestKey,
        version: 1,
        countedCash: '0',
      })
    ).status,
  ).toBe(409);
  expect((await f.detail(stillOpen.shift.id, actor)).shift.status).toBe('OPEN');
});

it('recovery financiar: replay după CLOSE este actor-bound și păstrează id-ul turei înghețate', async () => {
  const actor = f.actors.cashier!.session;
  const opened = await f.open(actor, '100');
  const order = await f.order();
  const body = {
    version: order.version,
    requestKey: randomUUID(),
    cashShiftId: opened.shift.id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '10' }],
  };
  const path = `/orders/${order.id}`;
  const paid = await actor.expect(`${path}/payments`, 'POST', body);
  const identity = { locationId: f.locationId, requestKey: body.requestKey, kind: 'COLLECT' };
  const expected = {
    status: 'SUCCEEDED',
    command: { ...identity, orderId: order.id },
    result: { operation: paid.operation },
  };
  expect(await actor.expect(`${path}/payment-commands/resolution`, 'POST', identity)).toEqual(
    expected,
  );
  await f.close(opened.shift.id, actor);
  const frozen = await f.detail(opened.shift.id, actor);
  expect((await actor.expect(`${path}/payments`, 'POST', body)).operation).toEqual(paid.operation);
  expect(await actor.expect(`${path}/payment-commands/resolution`, 'POST', identity)).toEqual(
    expected,
  );
  expect((await f.actors.other!.session.call(`${path}/payments`, 'POST', body)).status).toBe(409);
  expect(
    (await f.actors.other!.session.call(`${path}/payment-commands/resolution`, 'POST', identity))
      .status,
  ).toBe(409);
  expect(
    (
      await actor.call(`${path}/payment-commands/resolution`, 'POST', {
        ...identity,
        kind: 'REFUND',
      })
    ).status,
  ).toBe(409);
  const replacement = await f.open(actor, '0');
  expect(
    (await actor.call(`${path}/payments`, 'POST', { ...body, cashShiftId: replacement.shift.id }))
      .status,
  ).toBe(409);
  expect(await f.detail(opened.shift.id, actor)).toEqual(frozen);
  expect((await f.detail(replacement.shift.id, actor)).shift.version).toBe(1);
  const unknown = { locationId: f.locationId, requestKey: randomUUID(), kind: 'COLLECT' };
  expect(await actor.expect(`${path}/payment-commands/resolution`, 'POST', unknown)).toEqual({
    status: 'RETIRED',
    command: { ...unknown, orderId: order.id },
  });
  expect(
    (
      await actor.call(`${path}/payments`, 'POST', {
        ...body,
        version: paid.order.version,
        cashShiftId: replacement.shift.id,
        requestKey: unknown.requestKey,
      })
    ).status,
  ).toBe(409);
  expect((await actor.expect(`${path}/payments`)).payments).toHaveLength(1);
});

it('namespace: aceeași cheie PAYMENT/CHECKOUT este independentă, iar DEMO nu devine MANUAL', async () => {
  const shift = await f.cashShift();
  const requestKey = randomUUID();
  const modern = await f.order();
  const manual = await f.order(true);
  const payment = await f.a.primary.expect(`/orders/${modern.id}/payments`, 'POST', {
    version: modern.version,
    cashShiftId: shift.id,
    requestKey,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '1' }],
  });
  const body = {
    version: manual.version,
    cashShiftId: shift.id,
    requestKey,
    method: 'CARD',
    confirmed: true,
  };
  const checkout = await f.a.primary.expect(`/orders/${manual.id}/checkout/manual`, 'POST', body);
  const identity = { locationId: f.locationId, requestKey };
  expect(
    (
      await f.a.primary.expect(`/orders/${modern.id}/payment-commands/resolution`, 'POST', {
        ...identity,
        kind: 'COLLECT',
      })
    ).result.operation.id,
  ).toBe(payment.operation.id);
  await f.close(shift.id);
  const snapshot = await f.detail(shift.id);
  expect(
    await f.a.primary.expect(`/orders/${manual.id}/manual-checkout-resolution`, 'POST', identity),
  ).toEqual({
    status: 'SUCCEEDED',
    command: { ...identity, kind: 'CHECKOUT_MANUAL', orderId: manual.id },
    result: { receipt: checkout.receipt },
  });
  expect(
    (await f.a.primary.expect(`/orders/${manual.id}/checkout/manual`, 'POST', body)).receipt,
  ).toEqual(checkout.receipt);
  expect(await f.detail(shift.id)).toEqual(snapshot);
  const demo = await f.order(true);
  const demoBody = { version: demo.version, requestKey: randomUUID() };
  await f.a.primary.expect(`/orders/${demo.id}/checkout/demo`, 'POST', demoBody);
  expect(
    (
      await f.a.primary.call(`/orders/${demo.id}/manual-checkout-resolution`, 'POST', {
        locationId: f.locationId,
        requestKey: demoBody.requestKey,
      })
    ).status,
  ).toBe(409);
  const never = await f.order(true);
  const unknown = { locationId: f.locationId, requestKey: randomUUID() };
  expect(
    (await f.a.primary.expect(`/orders/${never.id}/manual-checkout-resolution`, 'POST', unknown))
      .status,
  ).toBe('RETIRED');
  const newShift = await f.open();
  expect(
    (
      await f.a.primary.call(`/orders/${never.id}/checkout/manual`, 'POST', {
        ...body,
        version: never.version,
        requestKey: unknown.requestKey,
        cashShiftId: newShift.shift.id,
      })
    ).status,
  ).toBe(409);
});

it('recovery: dreptul retras refuză rezoluția fără să retragă tentativa', async () => {
  const actorRecord = f.actors.other!;
  const actor = actorRecord.session;
  const { shift } = await f.open(actor, '0');
  const order = await f.order();
  const requestKey = randomUUID();
  const body = {
    version: order.version,
    requestKey,
    cashShiftId: shift.id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '1' }],
  };
  const path = `/orders/${order.id}`;
  const paid = await actor.expect(`${path}/payments`, 'POST', body);
  const identity = { locationId: f.locationId, requestKey, kind: 'COLLECT' };
  const denied = await f.a.primary.expect(`/staff/${actorRecord.userId}/overrides`, 'POST', {
    permission: 'payments.collect',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.locationId,
  });
  const restricted = await f.login(actorRecord);
  expect(
    (await restricted.call(`${path}/payment-commands/resolution`, 'POST', identity)).status,
  ).toBe(403);
  expect((await restricted.call(`${path}/payments`, 'POST', body)).status).toBe(403);
  expect((await f.a.primary.expect(`${path}/payments`)).payments).toHaveLength(1);
  expect(paid.operation.id).toBeTypeOf('string');
  await f.a.primary.expect(
    `/staff/${actorRecord.userId}/overrides/${denied.override.id}`,
    'DELETE',
    {},
  );
  const restored = await f.login(actorRecord);
  expect(
    (await restored.expect(`${path}/payment-commands/resolution`, 'POST', identity)).result
      .operation,
  ).toEqual(paid.operation);
});

it('DEMO nou: claim-ul este legat de actor fără drepturi de casă suplimentare', async () => {
  const first = await f.login(f.actors.demoA!);
  const second = await f.login(f.actors.demoB!);
  const order = await f.order(true);
  const body = { version: order.version, requestKey: randomUUID() };
  const path = `/orders/${order.id}/checkout/demo`;
  const saved = await first.expect(path, 'POST', body);
  expect((await first.expect(path, 'POST', body)).receipt).toEqual(saved.receipt);
  expect((await second.call(path, 'POST', body)).status).toBe(409);
});

it('recovery REFUND: retry închis și retragere terminală nu repetă rambursarea', async () =>
  verifyRefundResolution(f));
