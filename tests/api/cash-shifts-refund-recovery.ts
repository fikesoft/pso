import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CashShiftsFixture } from './cash-shifts.types';

export async function verifyRefundResolution(f: CashShiftsFixture) {
  const actor = await f.login(f.actors.cashier!);
  const { shift } = await f.open(actor, '0');
  const order = await f.order();
  const path = `/orders/${order.id}`;
  const paid = await actor.expect(`${path}/payments`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
    cashShiftId: shift.id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '10' }],
  });
  const ledger = await actor.expect(`${path}/payments`);
  const body = {
    version: paid.order.version,
    requestKey: randomUUID(),
    cashShiftId: shift.id,
    confirmed: true,
    reason: 'Rambursare pentru rezoluție',
    refunds: [{ paymentId: ledger.payments[0].id, amount: '1' }],
  };
  const { cashShiftId: omittedShift, ...missingShift } = body;
  expect(omittedShift).toBe(shift.id);
  const missing = await actor.call(`${path}/refunds`, 'POST', missingShift);
  expect(missing.status).toBe(409);
  expect(missing.data.code).toBe('CASH_SHIFT_REQUIRED');
  const returned = await actor.expect(`${path}/refunds`, 'POST', body);
  const identity = { locationId: f.locationId, requestKey: body.requestKey, kind: 'REFUND' };
  expect(
    (await actor.call(`${path}/payment-commands/resolution`, 'POST', identity, {}, false)).status,
  ).toBe(403);
  const expected = {
    status: 'SUCCEEDED',
    command: { ...identity, orderId: order.id },
    result: { operation: returned.operation },
  };
  expect(await actor.expect(`${path}/payment-commands/resolution`, 'POST', identity)).toEqual(
    expected,
  );
  await f.close(shift.id, actor);
  const frozen = await f.detail(shift.id, actor);
  expect((await actor.expect(`${path}/refunds`, 'POST', body)).operation).toEqual(
    returned.operation,
  );
  expect(await actor.expect(`${path}/payment-commands/resolution`, 'POST', identity)).toEqual(
    expected,
  );
  expect(await f.detail(shift.id, actor)).toEqual(frozen);
  const next = await f.open(actor, '0');
  const retired = { ...identity, requestKey: randomUUID() };
  expect(await actor.expect(`${path}/payment-commands/resolution`, 'POST', retired)).toEqual({
    status: 'RETIRED',
    command: { ...retired, orderId: order.id },
  });
  expect(
    (
      await actor.call(`${path}/refunds`, 'POST', {
        ...body,
        requestKey: retired.requestKey,
        version: returned.order.version,
        cashShiftId: next.shift.id,
      })
    ).status,
  ).toBe(409);
  expect((await actor.expect(`${path}/payment-operations`)).operations).toHaveLength(2);
  expect((await f.detail(next.shift.id, actor)).shift.version).toBe(1);
}
