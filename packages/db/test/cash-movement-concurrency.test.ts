import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import type { TenantTransaction } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeCashMovement } from './fixtures/cash-movement.fixture';
import { readShiftSummary } from '../../../apps/api/src/entities/cash-shift';
import { paymentSummary } from '../../../apps/api/src/entities/order';
import { cashConflict } from './fixtures/cash-conflict.fixture';

test('PostgreSQL real: IN/OUT/CLOSE/RETIRED blocare observată RC/RR', async (t) => {
  const f = await createOperationsFixture();
  const client = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    monitor = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1);
  try {
    const controlOrder = await f.createDraft();
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const)
      for (const scenario of [
        'IN_CLOSE',
        'CLOSE_IN',
        'OUT_CLOSE',
        'CLOSE_OUT',
        'OUT_OUT',
        'IN_OUT',
        'IN_RETIRE',
        'RETIRE_IN',
      ] as const)
        await t.test(`${isolationLevel}: ${scenario}`, async () => {
          const shift = await openCashShiftFixture(f, 'a', f.locationA.id, '10'),
            winnerKey = randomUUID();
          const sharesKey = scenario.includes('RETIRE');
          const loserKey = sharesKey ? winnerKey : randomUUID();
          const [first, second] = scenario.split('_');
          const act = async (tx: TenantTransaction, kind: string, requestKey: string) => {
            if (kind === 'IN' || kind === 'OUT')
              await writeCashMovement(tx, shift.id, kind, '7', {
                expectedVersion: 1,
                requestKey,
              });
            else if (kind === 'RETIRE')
              await tx.cashCommandClaim.create({
                data: {
                  organizationId: shift.organizationId,
                  locationId: shift.locationId,
                  family: 'CASH',
                  kind: 'CASH_IN',
                  requestKey,
                  actorUserId: f.a.user.id,
                  shiftId: shift.id,
                  status: 'RETIRED',
                },
              });
            else
              await tx.cashOperation.create({
                data: {
                  organizationId: shift.organizationId,
                  locationId: shift.locationId,
                  registerId: shift.registerId,
                  shiftId: shift.id,
                  kind: 'CLOSE',
                  requestKey,
                  requestHash: 'f'.repeat(64),
                  actorUserId: f.a.user.id,
                  expectedVersion: 1,
                  cashShiftVersion: 2,
                  countedCash: '10',
                },
              });
          };
          let ready!: () => void, written!: () => void, release!: () => void;
          const snapshot = new Promise<void>((r) => {
              ready = r;
            }),
            writing = new Promise<void>((r) => {
              written = r;
            }),
            commit = new Promise<void>((r) => {
              release = r;
            });
          let winnerPid = 0,
            loserPid = 0;
          const loser = client.$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true),set_config('app.user_id',${f.a.user.id},true)`;
              const [pid] = await tx.$queryRaw<
                Array<{ id: number }>
              >`SELECT pg_backend_pid() AS id`;
              loserPid = pid!.id;
              assert.equal(
                (await tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } })).version,
                1,
              );
              ready();
              await writing;
              await act(tx, second!, loserKey);
            },
            { isolationLevel, timeout: 15000 },
          );
          const outcome = Promise.allSettled([loser]);
          await snapshot;
          const winner = f.txA(async (tx) => {
            const [pid] = await tx.$queryRaw<Array<{ id: number }>>`SELECT pg_backend_pid() AS id`;
            winnerPid = pid!.id;
            await act(tx, first!, winnerKey);
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
              await new Promise((r) => setTimeout(r, 10));
            }
          } finally {
            release();
          }
          await winner;
          const [result] = await outcome;
          assert.notEqual(winnerPid, loserPid);
          assert.ok(blocked);
          assert.equal(result!.status, 'rejected');
          if (result!.status === 'rejected')
            assert.ok(
              cashConflict(
                result!.reason,
                sharesKey
                  ? /cannot retire an existing command|Unique constraint/i
                  : /open scoped shift|own open shift and current version|closing requires current version/i,
              ),
            );
          const rows = await f.txA(async (tx) => ({
            shift: await tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } }),
            operations: await tx.cashOperation.count({ where: { shiftId: shift.id } }),
            movements: await tx.cashMovement.count({ where: { shiftId: shift.id } }),
            claims: await tx.cashCommandClaim.findMany({
              where: { requestKey: { in: [winnerKey, loserKey] } },
            }),
            summary: await readShiftSummary(tx, f.a.organization.id, shift.id),
            unpaid: await paymentSummary(tx, controlOrder.order.id),
          }));
          assert.equal(rows.shift.version, first === 'RETIRE' ? 1 : 2);
          assert.equal(rows.operations, first === 'RETIRE' ? 1 : 2);
          assert.equal(rows.movements, first === 'IN' || first === 'OUT' ? 2 : 1);
          assert.equal(rows.claims.length, 1);
          assert.equal(rows.claims[0]!.requestKey, winnerKey);
          assert.equal(rows.claims[0]!.status, first === 'RETIRE' ? 'RETIRED' : 'SUCCEEDED');
          assert.equal(
            rows.summary.expectedCash,
            first === 'IN' ? '17.00' : first === 'OUT' ? '3.00' : '10.00',
          );
          assert.ok(!rows.summary.expectedCash.startsWith('-'));
          assert.equal(rows.summary.cashIn, first === 'IN' ? '7.00' : '0.00');
          assert.equal(rows.summary.cashOut, first === 'OUT' ? '7.00' : '0.00');
          assert.equal(rows.unpaid.outstandingAmount, '10.01');
          assert.equal(rows.unpaid.collectedAmount, '0.00');
        });
    await t.test('cash-only termină deși Order este blocat pe altă conexiune', async () => {
      const draft = await f.createDraft(),
        shift = await openCashShiftFixture(f);
      let held!: () => void, release!: () => void;
      const ready = new Promise<void>((r) => {
          held = r;
        }),
        done = new Promise<void>((r) => {
          release = r;
        });
      const blocker = client.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true),set_config('app.user_id',${f.a.user.id},true)`;
          await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${draft.order.id}::uuid FOR UPDATE`;
          held();
          await done;
        },
        { timeout: 10000 },
      );
      await ready;
      try {
        await f.txA(async (tx) => {
          await tx.$executeRaw`SET LOCAL lock_timeout='500ms'`;
          await writeCashMovement(tx, shift.id, 'OUT', '1');
        });
      } finally {
        release();
        await blocker;
      }
    });
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
