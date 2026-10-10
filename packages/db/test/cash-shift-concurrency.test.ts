import { cashConflict } from './fixtures/cash-conflict.fixture';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import {
  createCashRegisterFixture,
  createRegister,
  registerData,
  updateRegister,
} from './fixtures/cash-register.fixture';
import { openRegisterShiftFixture } from './fixtures/cash-shift.fixture';

test('PostgreSQL real: OPEN/arhivare și gate partajat la RC/RR', async (t) => {
  const f = await createCashRegisterFixture();
  const client = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1);
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const first of ['OPEN', 'ARCHIVE'] as const) {
        await t.test(`${isolationLevel}: ${first} înaintea snapshotului concurent`, async () => {
          const register = await f.txA((tx) => createRegister(tx, registerData(f)));
          let snapshotReady!: () => void, proceed!: () => void;
          const snapshot = new Promise<void>((resolve) => {
            snapshotReady = resolve;
          });
          const committed = new Promise<void>((resolve) => {
            proceed = resolve;
          });
          const stale = client.$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true),set_config('app.user_id',${f.a.user.id},true)`;
              assert.equal(await tx.cashShift.count({ where: { registerId: register.id } }), 0);
              snapshotReady();
              await committed;
              if (first === 'OPEN') return updateRegister(tx, register.id, f.a.user.id, 'ARCHIVE');
              return openRegisterShiftFixture(tx, register.id, f.a.user.id);
            },
            { isolationLevel, timeout: 15000 },
          );
          const outcome = Promise.allSettled([stale]);
          await snapshot;
          try {
            await f.txA(async (tx) => {
              if (first === 'OPEN') await openRegisterShiftFixture(tx, register.id, f.a.user.id);
              else await updateRegister(tx, register.id, f.a.user.id, 'ARCHIVE');
            });
          } finally {
            proceed();
          }
          const [result] = await outcome;
          assert.equal(result!.status, 'rejected');
          if (result!.status === 'rejected')
            assert.ok(cashConflict(result!.reason, /open shift|active register/i));
          const state = await f.txA(async (tx) => ({
            register: await tx.cashRegister.findUniqueOrThrow({ where: { id: register.id } }),
            open: await tx.cashShift.count({ where: { registerId: register.id, status: 'OPEN' } }),
          }));
          assert.equal(state.register.status, first === 'OPEN' ? 'ACTIVE' : 'ARCHIVED');
          assert.equal(state.open, first === 'OPEN' ? 1 : 0);
        });
      }
    }
  } finally {
    await Promise.all([
      client.$disconnect(),
      f.runtime.$disconnect(),
      f.auth.$disconnect(),
      f.platform.$disconnect(),
    ]);
  }
});
