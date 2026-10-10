import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import type { TenantTransaction } from '../src';
import { writeBillItemSplit } from './fixtures/bill-items.fixture';
import { writeBillSplit } from './fixtures/bill-split.fixture';
import { responsibilityRace } from './fixtures/responsibility-race.fixture';
test('PostgreSQL: împărțirea și încasarea serializează soldul pe conexiuni independente', async (t) => {
  const f = await createOperationsFixture();
  const shift = await openCashShiftFixture(f);
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const mode of ['SPLIT_PAYMENT', 'PAYMENT_SPLIT', 'SPLIT_SPLIT', 'PART_PART'] as const) {
        for (const itemMode of [false, true]) {
          await t.test(`${isolationLevel}: ${mode} ${itemMode ? 'ITEMS' : 'EQUAL'}`, async () => {
            const { order } = await f.createDraft();
            await f.txA((tx) =>
              tx.order.update({
                where: { id: order.id },
                data: { status: 'CONFIRMED', version: 2 },
              }),
            );
            const writePlan = (tx: TenantTransaction) =>
              itemMode
                ? writeBillItemSplit(tx, order.id, f.a.user.id)
                : writeBillSplit(tx, [order.id], f.a.user.id);
            const partAmount = itemMode ? '3.00' : '3.34';
            const plan = mode === 'PART_PART' ? await f.txA(writePlan) : null;
            const result = await responsibilityRace({
              organizationId: f.a.organization.id,
              actor: f.a.user.id,
              isolationLevel,
              snapshot: (tx) => tx.billSplitSource.count(),
              winner: (tx) =>
                mode === 'PAYMENT_SPLIT' || mode === 'PART_PART'
                  ? writeFinancialCommand(tx, order.id, {
                      cashShiftId: shift.id,
                      payments: [{ amount: plan ? partAmount : '1.00' }],
                      operation: { billPartId: plan?.parts[0]!.id },
                    })
                  : writePlan(tx),
              loser: (tx) =>
                mode === 'SPLIT_SPLIT' || mode === 'PAYMENT_SPLIT'
                  ? writePlan(tx)
                  : writeFinancialCommand(tx, order.id, {
                      cashShiftId: shift.id,
                      payments: [{ amount: '1.00' }],
                      operation: { billPartId: plan?.parts[0]!.id },
                    }),
            });
            assert.equal(result.status, 'rejected');
            if (result.status === 'rejected')
              assert.match(
                String(result.reason),
                /split part|confirmed.*version|unpaid|unique|serializ|write conflict/i,
              );
            const [row] = await f.txA(
              (tx) =>
                tx.$queryRaw<
                  Array<{ amount: string }>
                >`SELECT public.order_net_paid(${order.organizationId}::uuid,${order.id}::uuid)::text AS amount`,
            );
            assert.equal(
              row!.amount,
              mode === 'PAYMENT_SPLIT' ? '1.00' : mode === 'PART_PART' ? partAmount : '0',
            );
            assert.equal(
              await f.txA((tx) => tx.billSplitSource.count({ where: { orderId: order.id } })),
              mode === 'PAYMENT_SPLIT' ? 0 : 1,
            );
          });
        }
      }
    }
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
