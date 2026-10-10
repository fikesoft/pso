import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { paymentSummary } from '../../../apps/api/src/entities/order';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { prepareCheckoutOrder, writeCheckout } from './fixtures/checkout.fixture';

test('PostgreSQL real: registru financiar independent, exact și imuabil', async (t) => {
  const f = await createOperationsFixture();
  const cashShift = await openCashShiftFixture(f);
  try {
    const draft = await f.createDraft();
    const post = (command: Omit<Parameters<typeof writeFinancialCommand>[2], 'cashShiftId'>) =>
      f.txA((tx) =>
        writeFinancialCommand(tx, draft.order.id, { ...command, cashShiftId: cashShift.id }),
      );
    const summary = () => f.txA((tx) => paymentSummary(tx, draft.order.id));
    await t.test(
      'ciorna refuză plăți; confirmarea fixează totalul înainte de preplată',
      async () => {
        await assert.rejects(post({ payments: [{ amount: '1' }] }), /current confirmed order/);
        await f.txA((tx) =>
          tx.order.update({
            where: { id: draft.order.id },
            data: { status: 'CONFIRMED', version: { increment: 1 } },
          }),
        );
        assert.equal((await summary()).status, 'UNPAID');
      },
    );
    await t.test('nicio parte a comenzii financiare nu poate lipsi sau diverge', async () => {
      for (const omit of ['lines', 'order', 'event'] as const) {
        await assert.rejects(
          post({ payments: [{ amount: '1' }], omit }),
          omit === 'order' ? /current scoped order version/ : /commit together/,
        );
        assert.equal((await summary()).collectedAmount, '0.00');
        assert.equal(
          await f.txA((tx) => tx.paymentOperation.count({ where: { orderId: draft.order.id } })),
          0,
        );
        assert.equal(
          (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: draft.order.id } })))
            .version,
          2,
        );
      }
      await assert.rejects(
        post({ payments: [{ amount: '1' }], event: { toStatus: 'PAID' } }),
        /timeline event/,
      );
      await assert.rejects(
        post({ payments: [{ amount: '1' }], operation: { orderVersion: 99 } }),
        /current confirmed order/,
      );
      await assert.rejects(post({ payments: [{ amount: '1', receivedAmount: '0.99' }] }));
      await assert.rejects(
        post({ payments: [{ amount: '1', method: 'CARD', receivedAmount: '2' }] }),
      );
      await assert.rejects(post({ payments: [{ amount: '1' }, { amount: '1' }] }));
      assert.equal((await summary()).collectedAmount, '0.00');
    });
    const partial = await post({ payments: [{ amount: '3.01', receivedAmount: '5' }] });
    await t.test(
      'numerar, card, rest exact și supraplata sunt independente de preparare',
      async () => {
        assert.equal((await summary()).status, 'PARTIALLY_PAID');
        assert.equal(partial.payments[0]!.changeAmount?.toFixed(2), '1.99');
        await assert.rejects(
          post({ payments: [{ amount: '7.01', method: 'CARD' }] }),
          /available balance/,
        );
        await post({
          payments: [
            { amount: '2', method: 'CASH' },
            { amount: '5', method: 'CARD' },
          ],
        });
        assert.deepEqual(await summary(), {
          status: 'PAID',
          collectedAmount: '10.01',
          refundedAmount: '0.00',
          netPaidAmount: '10.01',
          outstandingAmount: '0.00',
        });
        const current = await f.txA((tx) =>
          tx.order.findUniqueOrThrow({ where: { id: draft.order.id } }),
        );
        assert.equal(current.status, 'CONFIRMED');
        assert.equal(current.kitchenStatus, 'NOT_SENT');
        assert.equal(
          await f.txA((tx) => tx.inventoryDocument.count({ where: { orderId: current.id } })),
          0,
        );
        assert.equal(await f.txA((tx) => tx.checkout.count({ where: { orderId: current.id } })), 0);
        await assert.rejects(
          f.txA((tx) =>
            tx.payment.update({ where: { id: partial.payments[0]!.id }, data: { amount: '2' } }),
          ),
        );
        await assert.rejects(
          f.txA((tx) => tx.paymentOperation.delete({ where: { id: partial.operation.id } })),
        );
        assert.equal(
          await f.txB((tx) => tx.paymentOperation.count({ where: { orderId: current.id } })),
          0,
        );
        assert.equal(
          await f
            .txB(
              (tx) =>
                tx.$queryRaw<
                  Array<{ net: string }>
                >`SELECT public.order_net_paid(${f.a.organization.id}::uuid,${current.id}::uuid)::text AS net`,
            )
            .then((rows) => rows[0]!.net),
          '0',
        );
      },
    );
    await t.test(
      'rambursarea rămâne legată de plata originală și permite rambursări parțiale',
      async () => {
        const paymentId = partial.payments[0]!.id;
        await assert.rejects(
          post({ refunds: [{ paymentId, amount: '3.02' }] }),
          /remaining original payment/,
        );
        await assert.rejects(
          post({ refunds: [{ paymentId, amount: '1', method: 'CARD' }] }),
          /remaining original payment/,
        );
        await assert.rejects(
          post({ refunds: [{ paymentId, amount: '1' }], operation: { reason: null } }),
        );
        await post({ refunds: [{ paymentId, amount: '1.01' }] });
        assert.equal((await summary()).status, 'PARTIALLY_REFUNDED');
        await post({ refunds: [{ paymentId, amount: '2' }] });
        await assert.rejects(
          post({ refunds: [{ paymentId, amount: '0.01' }] }),
          /remaining original payment/,
        );
        const payments = await f.txA((tx) =>
          tx.payment.findMany({ where: { orderId: draft.order.id, id: { not: paymentId } } }),
        );
        await post({
          refunds: payments.map((p) => ({ paymentId: p.id, amount: p.amount.toFixed(2) })),
        });
        assert.deepEqual(await summary(), {
          status: 'REFUNDED',
          collectedAmount: '10.01',
          refundedAmount: '10.01',
          netPaidAmount: '0.00',
          outstandingAmount: '10.01',
        });
        await post({ payments: [{ amount: '10.01', method: 'CARD' }] });
        assert.equal((await summary()).status, 'PAID');
      },
    );
    await t.test(
      'plățile vechi se rambursează fără rescrierea bonului și a liniilor originale',
      async () => {
        const order = await prepareCheckoutOrder(f);
        const old = await writeCheckout(f, order, {
          mode: 'MANUAL',
          cashShiftId: cashShift.id,
          method: 'CARD',
          receivedAmount: order.total,
          changeAmount: '0',
        });
        const original = JSON.stringify(old);
        await f.txA((tx) =>
          writeFinancialCommand(tx, order.id, {
            cashShiftId: cashShift.id,
            refunds: [{ paymentId: old.payment!.id, amount: '4.01' }],
          }),
        );
        assert.equal(
          (await f.txA((tx) => paymentSummary(tx, order.id))).status,
          'PARTIALLY_REFUNDED',
        );
        const reread = await f.txA(async (tx) => ({
          checkout: await tx.checkout.findUnique({ where: { id: old.checkout.id } }),
          payment: await tx.payment.findUnique({ where: { id: old.payment!.id } }),
        }));
        assert.equal(JSON.stringify(reread), original);
        const demo = await prepareCheckoutOrder(f);
        await writeCheckout(f, demo);
        await assert.rejects(
          f.txA((tx) =>
            writeFinancialCommand(tx, demo.id, {
              cashShiftId: cashShift.id,
              payments: [{ amount: '1' }],
            }),
          ),
          /available balance/,
        );
      },
    );
    await t.test(
      'liniile financiare nu pot fi adăugate în tranzacții ulterioare și RLS este forțat',
      async () => {
        await assert.rejects(
          f.txA((tx) =>
            tx.payment.create({
              data: {
                organizationId: f.a.organization.id,
                locationId: draft.order.locationId,
                orderId: draft.order.id,
                operationId: partial.operation.id,
                amount: '0.01',
                method: 'CARD',
                receivedAmount: '0.01',
                changeAmount: '0',
                confirmedByUserId: f.a.user.id,
              },
            }),
          ),
          /atomic collection/,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.orderStatusEvent.create({
              data: {
                organizationId: f.a.organization.id,
                locationId: draft.order.locationId,
                orderId: draft.order.id,
                kind: 'PAYMENT',
                fromStatus: 'PAID',
                toStatus: 'REFUNDED',
                actorUserId: f.a.user.id,
                requestKey: randomUUID(),
                requestHash: 'a'.repeat(64),
              },
            }),
          ),
          /timeline event/,
        );
        const tables = await f.runtime.$queryRaw<
          Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>
        >`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('PaymentOperation','PaymentRefund')`;
        assert.equal(tables.length, 2);
        assert.ok(tables.every((row) => row.relrowsecurity && row.relforcerowsecurity));
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
