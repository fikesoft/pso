import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { writeBillSplit } from './fixtures/bill-split.fixture';
import { readBillBalances } from '../../../apps/api/src/entities/bill-split';
test('PostgreSQL: părți exacte, imuabile și încasări limitate la partea aleasă', async () => {
  const f = await createOperationsFixture();
  const shift = await openCashShiftFixture(f);
  try {
    const { order } = await f.createDraft();
    const split = (corrupt = false) =>
      f.txA((tx) => writeBillSplit(tx, [order.id], f.a.user.id, undefined, undefined, corrupt));
    await assert.rejects(split(), /exact confirmed unpaid/);
    await f.txA((tx) =>
      tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', version: 2 } }),
    );
    await assert.rejects(split(true), /exact source, part and allocation totals/);
    assert.equal(await f.txA((tx) => tx.billSplit.count()), 0);
    const plan = await split();
    const balances = () =>
      f.txA((tx) => readBillBalances(tx, order.organizationId, order.locationId, plan.split.id));
    const firstBalance = async () =>
      (await balances()).find((row) => row.partId === plan.parts[0]!.id)!;
    assert.equal((await firstBalance()).outstandingAmount, '3.34');
    assert.deepEqual(
      await f.txB((tx) =>
        readBillBalances(tx, order.organizationId, order.locationId, plan.split.id),
      ),
      [],
    );
    assert.deepEqual(
      await f.txA((tx) =>
        readBillBalances(tx, order.organizationId, f.locationB.id, plan.split.id),
      ),
      [],
    );
    assert.deepEqual(
      plan.parts.map((part) => part.amount.toFixed(2)),
      ['3.34', '3.34', '3.33'],
    );
    assert.equal(await f.runtime.billPart.count(), 0);
    assert.equal(await f.txB((tx) => tx.billSplit.count()), 0);
    await assert.rejects(f.platform.billSplit.findMany(), /permission denied/);
    await assert.rejects(
      f.txA((tx) =>
        tx.billPart.update({ where: { id: plan.parts[0]!.id }, data: { amount: '3.35' } }),
      ),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.billPart.create({
          data: {
            organizationId: order.organizationId,
            locationId: order.locationId,
            splitId: plan.split.id,
            position: 4,
            amount: '1',
          },
        }),
      ),
      /atomic immutable split/,
    );
    const collect = (amount: string, billPartId?: string) =>
      f.txA((tx) =>
        writeFinancialCommand(tx, order.id, {
          cashShiftId: shift.id,
          payments: [{ amount }],
          operation: { billPartId },
        }),
      );
    await assert.rejects(collect('1'), /lacks its part/);
    await assert.rejects(collect('3.35', plan.parts[0]!.id), /exceeds split part/);
    const paid = await collect('3.34', plan.parts[0]!.id);
    assert.equal((await firstBalance()).netPaidAmount, '3.34');
    assert.equal((await firstBalance()).outstandingAmount, '0.00');
    await assert.rejects(collect('0.01', plan.parts[0]!.id), /exceeds split part/);
    await f.txA((tx) =>
      writeFinancialCommand(tx, order.id, {
        cashShiftId: shift.id,
        refunds: [{ paymentId: paid.payments[0]!.id, amount: '1.00' }],
      }),
    );
    assert.equal((await firstBalance()).netPaidAmount, '2.34');
    assert.equal((await firstBalance()).outstandingAmount, '1.00');
    await collect('1.00', plan.parts[0]!.id);
    await collect('3.34', plan.parts[1]!.id);
    await collect('3.33', plan.parts[2]!.id);
    assert.ok((await balances()).every((row) => row.outstandingAmount === '0.00'));
    const [net] = await f.txA(
      (tx) =>
        tx.$queryRaw<
          Array<{ amount: string }>
        >`SELECT public.order_net_paid(${order.organizationId}::uuid,${order.id}::uuid)::text AS amount`,
    );
    assert.equal(net!.amount, '10.01');
    const another = await f.createDraft();
    await f.txA((tx) =>
      tx.order.update({
        where: { id: another.order.id },
        data: { status: 'CONFIRMED', version: 2 },
      }),
    );
    await assert.rejects(
      f.txA((tx) =>
        writeFinancialCommand(tx, another.order.id, {
          cashShiftId: shift.id,
          payments: [{ amount: '1' }],
          operation: { billPartId: plan.parts[0]!.id },
        }),
      ),
      /no split part/,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
