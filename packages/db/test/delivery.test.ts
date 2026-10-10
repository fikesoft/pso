import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createInventoryFixture, inventoryBalance } from './fixtures/inventory.fixture';
import { sendInventoryOrder } from './fixtures/inventory-send.fixture';
import { readyInventoryOrder } from './fixtures/inventory-finalize.fixture';
import { writeDelivery } from './fixtures/delivery.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { checkoutData } from './fixtures/checkout.fixture';

test('PostgreSQL real: livrare independentă, atribuire și istoric imuabil', async (t) => {
  const f = await createInventoryFixture();
  const cashShift = await openCashShiftFixture(f);
  try {
    const sent = await sendInventoryOrder(f, { serviceType: 'DELIVERY', quantity: '1' });
    const current = () =>
      f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: sent.order.id } }));
    const assign = { toStatus: 'ASSIGNED', courierUserId: f.a.user.id };
    await t.test(
      'inițializarea urmărește tipul comenzii fără a permite atribuire în ciornă',
      async () => {
        const draft = await f.createDraft();
        assert.equal(draft.order.deliveryStatus, 'NOT_REQUIRED');
        await assert.rejects(f.txA((tx) => writeDelivery(tx, draft.order.id, assign)));
        const changed = await f.txA((tx) =>
          tx.order.update({
            where: { id: draft.order.id },
            data: {
              serviceType: 'DELIVERY',
              version: { increment: 1 },
            },
          }),
        );
        assert.equal(changed.deliveryStatus, 'WAITING_COURIER');
        await assert.rejects(
          f.txA((tx) =>
            tx.order.update({
              where: { id: draft.order.id },
              data: {
                deliveryStatus: 'FAILED',
                version: { increment: 1 },
              },
            }),
          ),
          /atomic delivery operation/,
        );
        assert.equal((await current()).deliveryStatus, 'WAITING_COURIER');
      },
    );
    await t.test('starea, versiunea, actorul și evenimentul se salvează împreună', async () => {
      for (const input of [
        { ...assign, omit: 'order' as const },
        { ...assign, omit: 'event' as const },
        { ...assign, event: { toStatus: 'DELIVERED' } },
        { ...assign, event: { actorUserId: f.b.user.id } },
        { ...assign, orderVersion: 999 },
        { ...assign, courierUserId: f.b.user.id },
        { toStatus: 'DELIVERED' },
        { toStatus: 'FAILED' },
      ]) {
        await assert.rejects(f.txA((tx) => writeDelivery(tx, sent.order.id, input)));
        assert.equal((await current()).deliveryStatus, 'WAITING_COURIER');
      }
      const op = await f.txA((tx) => writeDelivery(tx, sent.order.id, assign));
      assert.equal(op.fromStatus, 'WAITING_COURIER');
      assert.equal(op.previousCourierId, null);
      assert.equal((await current()).deliveryCourierId, f.a.user.id);
      assert.equal((await current()).status, 'CONFIRMED');
      assert.equal(await inventoryBalance(f, f.packaging.id), '0.000000');
      await assert.rejects(
        f.txA((tx) => writeDelivery(tx, sent.order.id, { toStatus: 'PICKED_UP' })),
        /prepared order/,
      );
      await assert.rejects(
        f.txA((tx) => writeDelivery(tx, sent.order.id, { ...assign, reason: 'Același curier' })),
        /distinct courier/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.order.update({
            where: { id: sent.order.id },
            data: {
              status: 'CANCELLED',
              version: { increment: 1 },
            },
          }),
        ),
        /active delivery/,
      );
    });
    await t.test(
      'preluarea cere preparare; livrarea și plata evoluează fără consum implicit',
      async () => {
        await readyInventoryOrder(f, sent);
        await f.txA((tx) => writeDelivery(tx, sent.order.id, { toStatus: 'PICKED_UP' }));
        await f.txA((tx) =>
          writeFinancialCommand(tx, sent.order.id, {
            cashShiftId: cashShift.id,
            payments: [{ amount: '1', method: 'CARD' }],
          }),
        );
        await f.txA((tx) => writeDelivery(tx, sent.order.id, { toStatus: 'DELIVERING' }));
        await f.txA((tx) => writeDelivery(tx, sent.order.id, { toStatus: 'DELIVERED' }));
        assert.equal((await current()).status, 'READY');
        assert.equal((await current()).deliveryStatus, 'DELIVERED');
        assert.equal(
          await f.txA((tx) => tx.inventoryDocument.count({ where: { orderId: sent.order.id } })),
          0,
        );
        await assert.rejects(
          f.txA((tx) =>
            writeDelivery(tx, sent.order.id, { toStatus: 'FAILED', reason: 'Nu revenim' }),
          ),
          /invalid delivery transition/,
        );
      },
    );
    await t.test(
      'eșecul și reluarea păstrează motivul și curierul istoric, apoi eliberează atribuirea',
      async () => {
        const fresh = await sendInventoryOrder(f, { serviceType: 'DELIVERY' });
        await f.txA((tx) => writeDelivery(tx, fresh.order.id, assign));
        const failed = await f.txA((tx) =>
          writeDelivery(tx, fresh.order.id, { toStatus: 'FAILED', reason: 'Client indisponibil' }),
        );
        assert.equal(failed.courierUserId, f.a.user.id);
        await assert.rejects(
          f.txA((tx) => writeDelivery(tx, fresh.order.id, { toStatus: 'WAITING_COURIER' })),
          /require a reason/,
        );
        const retry = await f.txA((tx) =>
          writeDelivery(tx, fresh.order.id, {
            toStatus: 'WAITING_COURIER',
            reason: 'Clientul a revenit',
          }),
        );
        assert.equal(retry.previousCourierId, f.a.user.id);
        assert.equal(retry.courierUserId, null);
        const ready = await readyInventoryOrder(f, fresh);
        const data = await checkoutData(f, ready);
        await assert.rejects(
          f.txA((tx) => tx.checkout.create({ data })),
          /tracked delivery/,
        );
      },
    );
    await t.test(
      'RLS, ACL, chei compuse și refuzul evenimentelor tardive protejează istoricul',
      async () => {
        const ops = await f.txA((tx) =>
          tx.deliveryOperation.findMany({ where: { orderId: sent.order.id } }),
        );
        const op = ops[0]!;
        assert.equal(
          await f.txB((tx) => tx.deliveryOperation.count({ where: { orderId: sent.order.id } })),
          0,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.deliveryOperation.update({ where: { id: op.id }, data: { reason: 'Rescriere' } }),
          ),
        );
        await assert.rejects(f.txA((tx) => tx.deliveryOperation.delete({ where: { id: op.id } })));
        await assert.rejects(
          f.txA((tx) =>
            tx.orderStatusEvent.create({
              data: {
                organizationId: op.organizationId,
                locationId: op.locationId,
                orderId: op.orderId,
                kind: 'DELIVERY',
                fromStatus: op.fromStatus,
                toStatus: op.toStatus,
                actorUserId: op.actorUserId,
                requestKey: randomUUID(),
                requestHash: op.requestHash,
                orderVersion: op.orderVersion,
              },
            }),
          ),
          /atomic command/,
        );
        const [security] = await f.runtime.$queryRaw<
          Array<{ relforcerowsecurity: boolean; canupdate: boolean }>
        >`
        SELECT relforcerowsecurity, has_table_privilege(current_user,'"DeliveryOperation"','UPDATE') AS canupdate
        FROM pg_class WHERE oid='"DeliveryOperation"'::regclass`;
        assert.equal(security?.relforcerowsecurity, true);
        assert.equal(security?.canupdate, false);
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
