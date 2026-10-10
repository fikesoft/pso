import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { TenantTransaction } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { writeBillSplit } from './fixtures/bill-split.fixture';
import { responsibilityRace } from './fixtures/responsibility-race.fixture';
test('PostgreSQL: anularea și încasarea serializează sursa activă', async (t) => {
  const f = await createOperationsFixture(),
    shift = await openCashShiftFixture(f);
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const mode of ['VOID_COLLECT', 'COLLECT_VOID', 'VOID_SPLIT'] as const) {
        await t.test(`${isolationLevel}: ${mode}`, async () => {
          const { order } = await f.createDraft();
          await f.txA((tx) =>
            tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', version: 2 } }),
          );
          const plan = await f.txA((tx) => writeBillSplit(tx, [order.id], f.a.user.id));
          const voidPlan = (tx: TenantTransaction) =>
            tx.billSplitVoid.create({
              data: {
                organizationId: order.organizationId,
                locationId: order.locationId,
                splitId: plan.split.id,
                requestKey: randomUUID(),
                requestHash: 'a'.repeat(64),
                actorUserId: f.a.user.id,
                reason: 'Anulare concurentă verificată',
              },
            });
          const collect = (tx: TenantTransaction) =>
            writeFinancialCommand(tx, order.id, {
              cashShiftId: shift.id,
              payments: [{ amount: '1' }],
              operation: { billPartId: plan.parts[0]!.id },
            });
          const result = await responsibilityRace({
            organizationId: order.organizationId,
            actor: f.a.user.id,
            isolationLevel,
            snapshot: (tx) => tx.billSplitSource.count(),
            winner: mode === 'COLLECT_VOID' ? collect : voidPlan,
            loser:
              mode === 'COLLECT_VOID'
                ? voidPlan
                : mode === 'VOID_SPLIT'
                  ? (tx) => writeBillSplit(tx, [order.id], f.a.user.id)
                  : collect,
          });
          if (mode === 'VOID_SPLIT' && isolationLevel === 'ReadCommitted')
            assert.equal(result.status, 'fulfilled');
          else {
            assert.equal(result.status, 'rejected');
            if (result.status === 'rejected')
              assert.match(
                String(result.reason),
                /split part|no previous collection|serializ|write conflict/i,
              );
          }
          assert.equal(
            await f.txA((tx) => tx.payment.count({ where: { orderId: order.id } })),
            mode === 'COLLECT_VOID' ? 1 : 0,
          );
          assert.equal(
            await f.txA((tx) => tx.billSplitVoid.count({ where: { splitId: plan.split.id } })),
            mode === 'COLLECT_VOID' ? 0 : 1,
          );
        });
      }
    }
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
