import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { activate, BrowserSession } from './support/harness';
import type { CashShiftsFixture } from './cash-shifts.types';

export async function verifyShiftMfa(f: CashShiftsFixture) {
  const permissionNames = [
    'cash.registers.read',
    'cash.shifts.read',
    'cash.shifts.close',
    'cash.shifts.close-others',
    'cash.reports.read',
  ];
  const { role } = await f.a.primary.expect('/roles', 'POST', {
    name: 'Manager ture MFA',
    permissions: permissionNames.map((permission) => ({ permission })),
  });
  const account = await f.a.primary.expect('/staff', 'POST', {
    login: 'shift-manager',
    displayName: 'Manager ture',
    locationIds: [f.locationId],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.locationId },
    ],
  });
  const manager = new BrowserSession('TENANT');
  const activation = await activate(
    manager,
    'shift-manager',
    account.temporaryPassword,
    f.a.company.organization.slug,
  );
  expect(activation.state.stage).toBe('enroll');
  const actor = await f.login(f.actors.cashier!);
  const { shift } = await f.open(actor, '0');
  const body = {
    locationId: f.locationId,
    version: shift.version,
    requestKey: randomUUID(),
    countedCash: '0',
    managerReason: 'Închiderea solicitată de casier',
  };
  expect((await manager.call(`/cash-shifts/${shift.id}/close`, 'POST', body)).status).toBe(403);
  await manager.enroll();
  const result = await manager.expect(`/cash-shifts/${shift.id}/close`, 'POST', body);
  expect(result.shift.ownerUserId).toBe(f.actors.cashier!.userId);
  expect(result.closing.closedByUserId).toBe(account.user.id);
  expect(result.closing.managerReason).toBe(body.managerReason);
}
