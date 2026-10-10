import { checkpointCashEffects } from '../../../apps/api/src/entities/cash-shift';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVisitFixture } from './fixtures/table-visit.fixture';
import { createTable, tableData } from './fixtures/dining-table.fixture';
import { mergeVisits } from './fixtures/table-visit-merge.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { writeBillSplit } from './fixtures/bill-split.fixture';
test('PostgreSQL: nota unei vizite unite conservă alocările pe comenzile originale', async () => {
  const f = await createVisitFixture();
  const shift = await openCashShiftFixture(f);
  try {
    const source = await f.txA((tx) => f.open(tx));
    const targetTable = await f.txA((tx) => createTable(tx, tableData(f)));
    const target = await f.txA((tx) => f.open(tx, targetTable.id));
    const one = await f.txA((tx) => f.linked(tx, source.id));
    const two = await f.txA((tx) => f.linked(tx, target.id));
    for (const order of [one, two])
      await f.txA((tx) =>
        tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', version: 2 } }),
      );
    await assert.rejects(
      f.txA((tx) => writeBillSplit(tx, [one.id, two.id], f.a.user.id, undefined, target.id)),
      /exact confirmed unpaid/,
    );
    await f.txA((tx) => mergeVisits(tx, source.id, target.id, f.a.user.id));
    const { split, parts } = await f.txA((tx) =>
      writeBillSplit(tx, [one.id, two.id], f.a.user.id, undefined, target.id),
    );
    assert.equal(split.total.toFixed(2), '20.02');
    assert.deepEqual(
      parts.map((part) => part.amount.toFixed(2)),
      ['6.68', '6.67', '6.67'],
    );
    const before = await f.txA((tx) => tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } }));
    await assert.rejects(
      f.txA(async (tx) => {
        const allocations = await tx.billPartAllocation.findMany({
          where: { partId: parts[1]!.id },
          orderBy: { orderId: 'asc' },
        });
        assert.equal(allocations.length, 2);
        for (const [index, allocation] of allocations.entries()) {
          await writeFinancialCommand(tx, allocation.orderId, {
            cashShiftId: shift.id,
            payments: [{ amount: allocation.amount.add(index === 1 ? '0.01' : '0').toFixed(2) }],
            operation: { billPartId: parts[1]!.id },
          });
          await checkpointCashEffects(tx);
        }
      }),
      /exceeds split part/,
    );
    assert.equal(await f.txA((tx) => tx.payment.count()), 0);
    assert.equal(
      (await f.txA((tx) => tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } }))).version,
      before.version,
    );
    for (const part of parts) {
      await f.txA(async (tx) => {
        const allocations = await tx.billPartAllocation.findMany({
          where: { partId: part.id },
          orderBy: { orderId: 'asc' },
        });
        for (const allocation of allocations) {
          await writeFinancialCommand(tx, allocation.orderId, {
            cashShiftId: shift.id,
            payments: [{ amount: allocation.amount.toFixed(2) }],
            operation: { billPartId: part.id },
          });
          await checkpointCashEffects(tx);
        }
      });
    }
    for (const order of [one, two]) {
      const [row] = await f.txA(
        (tx) =>
          tx.$queryRaw<
            Array<{ amount: string }>
          >`SELECT public.order_net_paid(${order.organizationId}::uuid,${order.id}::uuid)::text AS amount`,
      );
      assert.equal(row!.amount, '10.01');
    }
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
