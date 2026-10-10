import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { writeBillSplit } from './fixtures/bill-split.fixture';
test('PostgreSQL: încasarea compusă cere toate efectele și păstrează identitatea terminală', async () => {
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
      partId: plan.parts[0]!.id,
      requestKey: randomUUID(),
      actorUserId: f.a.user.id,
      status: 'SUCCEEDED',
      requestHash: 'a'.repeat(64),
      amount: '3.34',
      method: 'CASH',
      receivedAmount: '5.00',
      cashShiftId: shift.id,
      operationCount: 1,
    };
    await assert.rejects(
      f.txA((tx) => tx.billCollection.create({ data })),
      /all exact financial effects/,
    );
    await assert.rejects(
      f.txA((tx) => tx.billCollection.create({ data: { ...data, amount: '3.33' } })),
      /entire current outstanding/,
    );
    await assert.rejects(
      f.txA(async (tx) => {
        const collection = await tx.billCollection.create({ data });
        await writeFinancialCommand(tx, order.id, {
          cashShiftId: shift.id,
          payments: [{ amount: '3.34', receivedAmount: '4.00' }],
          operation: { billPartId: data.partId, billCollectionId: collection.id },
        });
      }),
      /all exact financial effects/,
    );
    assert.equal(await f.txA((tx) => tx.payment.count({ where: { orderId: order.id } })), 0);
    const collection = await f.txA(async (tx) => {
      const header = await tx.billCollection.create({ data });
      await writeFinancialCommand(tx, order.id, {
        cashShiftId: shift.id,
        payments: [{ amount: '3.34', receivedAmount: '5.00' }],
        operation: { billPartId: data.partId, billCollectionId: header.id },
      });
      return header;
    });
    assert.equal(await f.runtime.billCollection.count(), 0);
    assert.equal(await f.txB((tx) => tx.billCollection.count()), 0);
    await assert.rejects(f.platform.billCollection.findMany(), /permission denied/);
    await assert.rejects(
      f.txA((tx) =>
        tx.billCollection.update({ where: { id: collection.id }, data: { amount: '3.35' } }),
      ),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) =>
        writeFinancialCommand(tx, order.id, {
          cashShiftId: shift.id,
          payments: [{ amount: '1' }],
          operation: { billPartId: plan.parts[1]!.id, billCollectionId: collection.id },
        }),
      ),
      /atomic collection/,
    );
    const retired = {
      organizationId: order.organizationId,
      locationId: order.locationId,
      partId: plan.parts[1]!.id,
      requestKey: randomUUID(),
      actorUserId: f.a.user.id,
      status: 'RETIRED',
    };
    const terminal = await f.txA((tx) => tx.billCollection.create({ data: retired }));
    await assert.rejects(
      f.txA((tx) =>
        writeFinancialCommand(tx, order.id, {
          cashShiftId: shift.id,
          payments: [{ amount: '1' }],
          operation: { billPartId: retired.partId, billCollectionId: terminal.id },
        }),
      ),
      /atomic collection/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.billCollection.create({
          data: { ...data, partId: retired.partId, requestKey: retired.requestKey },
        }),
      ),
      /Unique constraint/,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
