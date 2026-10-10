import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CashMovementsFixture } from './cash-movements.types';

export async function verifyReducedMovementLimit(f: CashMovementsFixture) {
  const record = f.movementActors.limited!;
  const actor = await f.login(record);
  const { shift } = await f.open(actor, '0');
  const saved = await f.move(shift.id, { amount: '10' }, actor);
  const command = {
    locationId: f.locationId,
    shiftId: shift.id,
    requestKey: saved.body.requestKey,
    kind: 'CASH_IN',
  };
  const { users } = await f.a.primary.expect('/staff');
  const user = users.find((entry: { id: string }) => entry.id === record.userId);
  const { role } = await f.a.primary.expect('/roles', 'POST', {
    name: 'Plafon numerar redus',
    permissions: [
      ...['cash.registers.read', 'cash.shifts.read', 'cash.shifts.open', 'cash.shifts.close'].map(
        (permission) => ({ permission }),
      ),
      { permission: 'cash.movements.create', limits: { maxAmount: '5' } },
    ],
  });
  for (const assignment of user.assignments)
    await f.a.primary.expect(`/staff/${record.userId}/assignments/${assignment.id}`, 'DELETE', {});
  await f.a.primary.expect(`/staff/${record.userId}/assignments`, 'POST', {
    roleVersionId: role.versions[0].id,
    scopeType: 'LOCATION',
    locationId: f.locationId,
  });
  const reduced = await f.login(record);
  const path = `/cash-shifts/${shift.id}/movements`;
  expect((await reduced.call(path, 'POST', saved.body)).status).toBe(403);
  expect((await reduced.call('/cash-movement-commands/resolution', 'POST', command)).status).toBe(
    403,
  );
  const forged = await reduced.call(path, 'POST', { ...saved.body, amount: '1' });
  expect(forged.status).toBe(409);
  expect(forged.data.code).toBe('CASH_COMMAND_CONFLICT');
  const unknown = { ...command, requestKey: randomUUID() };
  expect((await reduced.expect('/cash-movement-commands/resolution', 'POST', unknown)).status).toBe(
    'RETIRED',
  );
  expect((await f.detail(shift.id, reduced)).summary.cashIn).toBe('10.00');
  await f.move(shift.id, { amount: '5' }, reduced);
  expect((await f.detail(shift.id, reduced)).summary.cashIn).toBe('15.00');
}
