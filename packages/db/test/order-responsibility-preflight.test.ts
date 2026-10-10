import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTenantTransaction } from '../src';
import { preflightFinancialShift } from '../../../apps/api/src/entities/cash-shift';
import { loadAuthorization } from '../../../apps/api/src/entities/tenant-access';
import { createResponsibilityFixture } from './fixtures/order-responsibility.fixture';
import { openCashShiftFixture, closeCashShiftFixture } from './fixtures/cash-shift.fixture';
import { HttpError } from '../../../apps/api/src/shared/lib/http';
test('PostgreSQL real: preflight financiar verifică scope înainte de gate fără row lock', async () => {
  const f = await createResponsibilityFixture();
  try {
    const foreign = await openCashShiftFixture(f, 'b');
    const otherLocation = await openCashShiftFixture(f, 'a', f.locationA2.id, '1');
    const check = (shiftId?: string) =>
      withTenantTransaction(
        f.runtime,
        { organizationId: f.a.organization.id, userId: f.a.user.id },
        async (tx) => {
          const { service } = await loadAuthorization(tx, f.a.organization.id);
          return preflightFinancialShift(
            tx,
            service,
            f.a.organization.id,
            f.a.user.id,
            f.locationA.id,
            shiftId,
          );
        },
        { readOnlySnapshot: true },
      );
    assert.equal((await check(f.shift.id)).id, f.shift.id);
    for (const id of [foreign.id, otherLocation.id])
      await assert.rejects(
        check(id),
        (error: unknown) => error instanceof HttpError && error.status === 404,
      );
    await assert.rejects(
      check(),
      (error: unknown) =>
        error instanceof HttpError && error.status === 409 && error.code === 'CASH_SHIFT_REQUIRED',
    );
    await f.txA((tx) => closeCashShiftFixture(tx, f.shift.id, '20'));
    await assert.rejects(
      check(f.shift.id),
      (error: unknown) =>
        error instanceof HttpError && error.status === 409 && error.code === 'CASH_SHIFT_NOT_OPEN',
    );
    assert.equal(await f.txA((tx) => tx.orderResponsibilityGate.count()), 0);
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
