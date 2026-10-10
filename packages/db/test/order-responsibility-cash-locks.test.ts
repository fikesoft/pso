import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import {
  createResponsibilityFixture,
  writeResponsibility,
} from './fixtures/order-responsibility.fixture';
import { openCashShiftFixture, closeCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeCashMovement } from './fixtures/cash-movement.fixture';
import { cashConflict } from './fixtures/cash-conflict.fixture';

test('PostgreSQL real: FK cash-only KEY SHARE rămâne compatibil cu Register NO KEY UPDATE', async (t) => {
  const f = await createResponsibilityFixture();
  const second = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    monitor = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1);
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const)
      for (const action of ['CLOSE', 'ASSIGN'] as const)
        for (const direction of ['IN', 'OUT'] as const)
          await t.test(
            `${isolationLevel}: cash ${direction} înainte FK, ${action} ține Register și așteaptă Shift`,
            async () => {
              const order = await f.confirmed(),
                shift = await openCashShiftFixture(f, 'a', f.locationA.id, '20');
              let ready!: () => void, held!: () => void, finish!: () => void;
              const snapshot = new Promise<void>((r) => {
                  ready = r;
                }),
                holding = new Promise<void>((r) => {
                  held = r;
                }),
                proceed = new Promise<void>((r) => {
                  finish = r;
                });
              let loserPid = 0,
                winnerPid = 0;
              const loser = second.$transaction(
                async (tx) => {
                  await tx.$queryRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true),set_config('app.user_id',${f.a.user.id},true)`;
                  const [pid] = await tx.$queryRaw<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
                  loserPid = pid!.id;
                  await tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } });
                  ready();
                  await holding;
                  if (action === 'CLOSE') await closeCashShiftFixture(tx, shift.id, '20');
                  else
                    await writeResponsibility(tx, order.id, {
                      kind: 'ASSIGN',
                      targetShiftId: shift.id,
                    });
                },
                { isolationLevel, timeout: 15000 },
              );
              const outcome = Promise.allSettled([loser]);
              await snapshot;
              const winner = f.txA(async (tx) => {
                const [pid] = await tx.$queryRaw<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
                winnerPid = pid!.id;
                await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id=${shift.id}::uuid FOR UPDATE`;
                held();
                await proceed;
                // Register FK KEY SHARE happens here, AFTER loser holds its Register NO KEY UPDATE.
                await writeCashMovement(tx, shift.id, direction, '1', { expectedVersion: 1 });
              });
              let blocked = false;
              try {
                await holding;
                for (let attempt = 0; attempt < 150; attempt++) {
                  const [row] = await monitor.$queryRaw<
                    { blocked: boolean }[]
                  >`SELECT ${winnerPid}::int=ANY(pg_blocking_pids(${loserPid}::int)) AS blocked`;
                  if (row!.blocked) {
                    blocked = true;
                    break;
                  }
                  await new Promise((r) => setTimeout(r, 10));
                }
              } finally {
                finish();
              }
              await winner;
              const [result] = await outcome;
              assert.ok(blocked);
              assert.notEqual(loserPid, winnerPid);
              if (isolationLevel === 'ReadCommitted' && action === 'ASSIGN')
                assert.equal(result!.status, 'fulfilled');
              else {
                assert.equal(result!.status, 'rejected');
                if (result!.status === 'rejected')
                  assert.ok(
                    cashConflict(result!.reason, /current version/),
                    String(result!.reason),
                  );
              }
              assert.equal(
                await f.txA((tx) => tx.cashOperation.count({ where: { shiftId: shift.id } })),
                2,
              );
              assert.equal(
                (await f.txA((tx) => tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } })))
                  .status,
                'OPEN',
              );
              assert.equal(
                await f.txA((tx) => tx.cashMovement.count({ where: { shiftId: shift.id } })),
                2,
              );
            },
          );
  } finally {
    await Promise.all([
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
      second.$disconnect(),
      monitor.$disconnect(),
    ]);
  }
});
