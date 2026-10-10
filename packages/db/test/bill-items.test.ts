import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { writeBillItemSplit } from './fixtures/bill-items.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';

test('PostgreSQL: alocări pe articole exacte, imuabile, izolate și încasabile', async () => {
  const f = await createOperationsFixture();
  try {
    const { order, item } = await f.createDraft();
    const foreign = await f.createDraft('b');
    await f.txA((tx) =>
      tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', version: 2 } }),
    );
    const write = (mutate?: Parameters<typeof writeBillItemSplit>[3]) =>
      f.txA((tx) => writeBillItemSplit(tx, order.id, f.a.user.id, mutate));
    await assert.rejects(
      write((sources) => {
        sources[0]!.amount = '10.02';
      }),
      /exact original snapshot/,
    );
    await assert.rejects(
      write((sources) => {
        sources[0]!.quantity = '1.001';
      }),
      /exact original snapshot/,
    );
    await assert.rejects(
      write((sources) => {
        sources[0]!.orderItemId = foreign.item.id;
      }),
      /exact original snapshot|foreign key/,
    );
    await assert.rejects(
      write((_, plan) => {
        plan.parts[0]!.items[0]!.quantity = '0.301';
      }),
      /complete exact quantities/,
    );
    await assert.rejects(
      write((_, plan) => {
        plan.parts[0]!.items[0]!.amount = '3.01';
      }),
      /complete exact quantities/,
    );
    // The totals remain valid, but the extra cent must go to a 0.350 share.
    await assert.rejects(
      write((_, plan) => {
        plan.parts[0]!.amount = '3.01';
        plan.parts[0]!.allocations[0]!.amount = '3.01';
        plan.parts[0]!.items[0]!.amount = '3.01';
        plan.parts[1]!.amount = '3.50';
        plan.parts[1]!.allocations[0]!.amount = '3.50';
        plan.parts[1]!.items[0]!.amount = '3.50';
      }),
      /rounding must use largest remainder/,
    );
    await assert.rejects(
      write((sources, plan) => {
        sources.length = 0;
        for (const part of plan.parts) part.items = [];
      }),
      /complete exact quantities/,
    );
    await assert.rejects(
      write((_, plan) => {
        plan.parts[0]!.amount = '3.01';
        plan.parts[0]!.allocations[0]!.amount = '3.01';
        plan.parts[1]!.amount = '3.50';
        plan.parts[1]!.allocations[0]!.amount = '3.50';
      }),
      /payment allocations must match item/,
    );
    assert.equal(await f.txA((tx) => tx.billSplit.count()), 0);
    const plan = await write();
    assert.deepEqual(
      plan.parts.map((part) => part.amount.toFixed(2)),
      ['3.00', '3.51', '3.50'],
    );
    assert.equal(await f.txA((tx) => tx.billPartItem.count()), 3);
    assert.equal(await f.runtime.billPartItem.count(), 0);
    assert.equal(await f.runtime.billSplitItem.count(), 0);
    assert.equal(await f.txB((tx) => tx.billPartItem.count()), 0);
    assert.equal(await f.txB((tx) => tx.billSplitItem.count()), 0);
    await assert.rejects(f.platform.billPartItem.findMany(), /permission denied/);
    await assert.rejects(f.platform.billSplitItem.findMany(), /permission denied/);
    await assert.rejects(
      f.txA((tx) => tx.billSplitItem.updateMany({ data: { quantity: '2' } })),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) => tx.billPartItem.deleteMany()),
      /permission denied/,
    );
    const stored = await f.txA((tx) => tx.billPartItem.findFirstOrThrow());
    await assert.rejects(
      f.txB((tx) => tx.billPartItem.create({ data: stored })),
      /row-level security|atomic immutable/,
    );
    await assert.rejects(
      f.txA((tx) => tx.billPartItem.create({ data: stored })),
      /atomic immutable/,
    );
    const shift = await openCashShiftFixture(f);
    for (const part of plan.parts)
      await f.txA((tx) =>
        writeFinancialCommand(tx, order.id, {
          cashShiftId: shift.id,
          payments: [{ amount: part.amount.toFixed(2) }],
          operation: { billPartId: part.id },
        }),
      );
    const payments = await f.txA((tx) => tx.payment.findMany({ where: { orderId: order.id } }));
    assert.equal(payments.length, 3);
    const original = await f.txA((tx) =>
      tx.orderItem.findUniqueOrThrow({ where: { id: item.id } }),
    );
    assert.equal(original.quantity.toFixed(3), '1.000');
    assert.equal(original.lineTotal.toFixed(2), '10.01');
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
