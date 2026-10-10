import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { writeBillSplit } from './fixtures/bill-split.fixture';
test('PostgreSQL: anularea eliberează numai sursele proprii neîncasate și conservă planul', async () => {
  const f = await createOperationsFixture(),
    shift = await openCashShiftFixture(f);
  try {
    const { order } = await f.createDraft();
    await f.txA((tx) =>
      tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', version: 2 } }),
    );
    const plan = await f.txA((tx) => writeBillSplit(tx, [order.id], f.a.user.id));
    const data = {
      organizationId: order.organizationId,
      locationId: order.locationId,
      splitId: plan.split.id,
      requestKey: randomUUID(),
      requestHash: 'a'.repeat(64),
      actorUserId: f.a.user.id,
      reason: 'Refacerea notei sintetice',
    };
    await assert.rejects(
      f.txA((tx) =>
        tx.billSplitSource.updateMany({
          where: { splitId: plan.split.id },
          data: { isActive: false },
        }),
      ),
      /atomic void/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', version: 3 } }),
      ),
      /void active bill split/,
    );
    await assert.rejects(
      f.txA((tx) => tx.billSplitVoid.create({ data: { ...data, actorUserId: f.b.user.id } })),
      /current scoped actor/,
    );
    await assert.rejects(
      f.txB((tx) => tx.billSplitVoid.create({ data })),
      /row-level security|current scoped actor/,
    );
    const voided = await f.txA((tx) => tx.billSplitVoid.create({ data }));
    assert.equal(
      await f.txA((tx) =>
        tx.billSplitSource.count({ where: { splitId: plan.split.id, isActive: true } }),
      ),
      0,
    );
    assert.equal(await f.txA((tx) => tx.billPart.count({ where: { splitId: plan.split.id } })), 3);
    assert.equal(await f.runtime.billSplitVoid.count(), 0);
    assert.equal(await f.txB((tx) => tx.billSplitVoid.count()), 0);
    await assert.rejects(f.platform.billSplitVoid.findMany(), /permission denied/);
    await assert.rejects(
      f.txA((tx) =>
        tx.billSplitVoid.update({
          where: { id: voided.id },
          data: { reason: 'Rescriere interzisă' },
        }),
      ),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.billSplitSource.updateMany({
          where: { splitId: plan.split.id },
          data: { isActive: true },
        }),
      ),
      /atomic void/,
    );
    const replacement = await f.txA((tx) =>
      writeBillSplit(tx, [order.id], f.a.user.id, { mode: 'EQUAL', count: 2 }),
    );
    await assert.rejects(
      f.txA((tx) =>
        writeFinancialCommand(tx, order.id, {
          cashShiftId: shift.id,
          payments: [{ amount: '1.00' }],
          operation: { billPartId: plan.parts[0]!.id },
        }),
      ),
      /split part/,
    );
    const paid = await f.txA((tx) =>
      writeFinancialCommand(tx, order.id, {
        cashShiftId: shift.id,
        payments: [{ amount: '1.00' }],
        operation: { billPartId: replacement.parts[0]!.id },
      }),
    );
    await f.txA((tx) =>
      writeFinancialCommand(tx, order.id, {
        cashShiftId: shift.id,
        refunds: [{ paymentId: paid.payments[0]!.id, amount: '1.00' }],
      }),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.billSplitVoid.create({
          data: { ...data, splitId: replacement.split.id, requestKey: randomUUID() },
        }),
      ),
      /no previous collection/,
    );
    assert.equal(
      await f.txA((tx) =>
        tx.billSplitSource.count({ where: { orderId: order.id, isActive: true } }),
      ),
      1,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
