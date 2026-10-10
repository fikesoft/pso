import { cashConflict } from './fixtures/cash-conflict.fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import type { TenantTransaction } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';

test('PostgreSQL real: încasare/rambursare/închidere concurente RC și RR', async (t) => {
  const f = await createOperationsFixture();
  const client = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1);
  const monitor = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1);
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const)
      for (const kind of ['CASH', 'CARD', 'REFUND', 'CLOSE'] as const)
        for (const closeFirst of kind === 'CLOSE' ? [true] : [true, false])
          await t.test(
            `${isolationLevel}: ${closeFirst ? 'CLOSE' : kind} → ${closeFirst ? kind : 'CLOSE'}`,
            async () => {
              const shift = await openCashShiftFixture(f);
              const draft = await f.createDraft();
              await f.txA((tx) =>
                tx.order.update({
                  where: { id: draft.order.id },
                  data: { status: 'CONFIRMED', version: { increment: 1 } },
                }),
              );
              const payment =
                kind === 'REFUND'
                  ? await f.txA((tx) =>
                      writeFinancialCommand(tx, draft.order.id, {
                        cashShiftId: shift.id,
                        payments: [{ amount: '2' }],
                      }),
                    )
                  : null;
              const initial = await f.txA((tx) =>
                tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } }),
              );
              const close = async (tx: TenantTransaction) => {
                await tx.cashOperation.create({
                  data: {
                    organizationId: shift.organizationId,
                    locationId: shift.locationId,
                    registerId: shift.registerId,
                    shiftId: shift.id,
                    kind: 'CLOSE',
                    requestKey: randomUUID(),
                    requestHash: 'c'.repeat(64),
                    actorUserId: f.a.user.id,
                    expectedVersion: initial.version,
                    cashShiftVersion: initial.version + 1,
                    countedCash: kind === 'REFUND' ? '1002' : '1000',
                    discrepancyReason: 'Probă concurență',
                  },
                });
              };
              const money = async (tx: TenantTransaction) => {
                if (kind === 'CLOSE') return close(tx);
                await writeFinancialCommand(tx, draft.order.id, {
                  cashShiftId: shift.id,
                  ...(kind === 'REFUND'
                    ? { refunds: [{ paymentId: payment!.payments[0]!.id, amount: '1' }] }
                    : { payments: [{ amount: '1', method: kind }] }),
                });
              };
              let ready!: () => void, written!: () => void, release!: () => void;
              const snapshot = new Promise<void>((resolve) => {
                ready = resolve;
              });
              const writing = new Promise<void>((resolve) => {
                written = resolve;
              });
              const commit = new Promise<void>((resolve) => {
                release = resolve;
              });
              let loserPid = 0,
                winnerPid = 0;
              const loser = client.$transaction(
                async (tx) => {
                  await tx.$queryRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true),set_config('app.user_id',${f.a.user.id},true)`;
                  const [pid] = await tx.$queryRaw<
                    Array<{ id: number }>
                  >`SELECT pg_backend_pid() AS id`;
                  loserPid = pid!.id;
                  assert.equal(
                    (await tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } })).version,
                    initial.version,
                  );
                  ready();
                  await writing;
                  if (closeFirst) await money(tx);
                  else await close(tx);
                },
                { isolationLevel, timeout: 15000 },
              );
              const outcome = Promise.allSettled([loser]);
              await snapshot;
              const winner = f.txA(async (tx) => {
                const [pid] = await tx.$queryRaw<
                  Array<{ id: number }>
                >`SELECT pg_backend_pid() AS id`;
                winnerPid = pid!.id;
                if (closeFirst) await close(tx);
                else await money(tx);
                written();
                await commit;
              });
              let blocked = false;
              try {
                await writing;
                for (let attempt = 0; attempt < 100; attempt++) {
                  const [row] = await monitor.$queryRaw<
                    Array<{ blocked: boolean }>
                  >`SELECT ${winnerPid}::int=ANY(pg_blocking_pids(${loserPid}::int)) AS blocked`;
                  if (row!.blocked) {
                    blocked = true;
                    break;
                  }
                  await new Promise((resolve) => setTimeout(resolve, 10));
                }
              } finally {
                release();
              }
              await winner;
              const [result] = await outcome;
              assert.notEqual(winnerPid, loserPid);
              assert.ok(blocked, 'Scriitorul concurent trebuie observat blocat înainte de commit');
              assert.equal(result!.status, 'rejected');
              if (result!.status === 'rejected')
                assert.ok(
                  cashConflict(
                    result!.reason,
                    /open scoped shift|closing requires current version/i,
                  ),
                );
              const final = await f.txA(async (tx) => ({
                shift: await tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } }),
                activities: await tx.cashShiftActivity.count({ where: { shiftId: shift.id } }),
                closings: await tx.cashClosing.count({ where: { shiftId: shift.id } }),
                financial: await tx.paymentOperation.count({ where: { cashShiftId: shift.id } }),
              }));
              assert.equal(final.shift.version, initial.version + 1);
              assert.equal(final.activities, initial.version + 1);
              assert.equal(final.closings, closeFirst ? 1 : 0);
              assert.equal(final.financial, (kind === 'REFUND' ? 1 : 0) + (closeFirst ? 0 : 1));
            },
          );
  } finally {
    await Promise.all([
      client.$disconnect(),
      monitor.$disconnect(),
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
    ]);
  }
});
