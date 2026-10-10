import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createResponsibilityFixture,
  writeResponsibility,
} from './fixtures/order-responsibility.fixture';
import { prepareCheckoutOrder, checkoutData } from './fixtures/checkout.fixture';
import { consumeOrder } from '../../../apps/api/src/entities/inventory';

test('PostgreSQL real: sursele MANUAL/DEMO sunt exacte, fără rezolvare client sau cronologie inventată', async (t) => {
  const f = await createResponsibilityFixture();
  try {
    for (const mode of ['MANUAL', 'DEMO'] as const)
      await t.test(mode, async () => {
        const order = await prepareCheckoutOrder(f);
        await f.txA((tx) =>
          writeResponsibility(tx, order.id, { kind: 'ASSIGN', targetShiftId: f.shift.id }),
        );
        const data = await checkoutData(f, order);
        const before = await f.txA((tx) =>
          tx.cashOperation.count({ where: { shiftId: f.shift.id } }),
        );
        const checkout = await f.txA(async (tx) => {
          const checkout = await tx.checkout.create({
            data: {
              ...data,
              mode,
              ...(mode === 'MANUAL'
                ? {
                    method: 'CARD',
                    receivedAmount: order.total,
                    changeAmount: '0',
                    cashShiftId: f.shift.id,
                  }
                : {}),
            },
          });
          if (mode === 'MANUAL')
            await tx.payment.create({
              data: {
                organizationId: order.organizationId,
                locationId: order.locationId,
                orderId: order.id,
                checkoutId: checkout.id,
                cashShiftId: checkout.cashShiftId,
                amount: order.total,
                currency: order.currency,
                method: 'CARD',
                confirmedByUserId: f.a.user.id,
              },
            });
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'COMPLETED', version: { increment: 1 } },
          });
          await consumeOrder(tx, {
            organizationId: order.organizationId,
            locationId: order.locationId,
            orderId: order.id,
            requestKey: checkout.requestKey,
            requestHash: checkout.requestHash,
            actorUserId: f.a.user.id,
            actorName: checkout.cashierName,
          });
          await tx.orderStatusEvent.create({
            data: {
              organizationId: order.organizationId,
              locationId: order.locationId,
              orderId: order.id,
              kind: 'ORDER',
              fromStatus: 'READY',
              toStatus: 'COMPLETED',
              actorUserId: f.a.user.id,
            },
          });
          return checkout;
        });
        const p = await f.txA((tx) =>
          tx.orderResponsibility.findFirstOrThrow({ where: { orderId: order.id } }),
        );
        const event = await f.txA((tx) =>
          tx.orderResponsibilityEvent.findUniqueOrThrow({ where: { id: p.lastEventId } }),
        );
        assert.equal(p.state, 'RESOLVED');
        assert.equal(p.version, 2);
        assert.equal(event.checkoutId, checkout.id);
        assert.equal(event.paymentOperationId, null);
        assert.equal(event.kind, mode === 'DEMO' ? 'RESOLVED_DEMO' : 'RESOLVED_PAID');
        assert.equal(
          await f.txA((tx) => tx.payment.count({ where: { orderId: order.id } })),
          mode === 'DEMO' ? 0 : 1,
        );
        assert.equal(
          await f.txA((tx) => tx.cashOperation.count({ where: { shiftId: f.shift.id } })),
          before,
        );
        assert.equal(
          await f.txA((tx) => tx.cashShiftActivity.count({ where: { checkoutId: checkout.id } })),
          mode === 'DEMO' ? 0 : 1,
        );
        const source = await f.txA((tx) =>
          tx.orderStatusEvent.findUniqueOrThrow({ where: { id: event.sourceOrderEventId! } }),
        );
        assert.equal(source.orderId, order.id);
        assert.equal(source.kind, 'ORDER');
        assert.equal(source.toStatus, 'COMPLETED');
      });
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
