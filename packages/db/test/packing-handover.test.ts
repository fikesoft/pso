import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPackingSessionFixture } from './fixtures/packing-session.fixture';
import { advanceKitchenBatch } from './fixtures/kitchen-batches.fixture';
import { completePackingFixture } from './fixtures/packing-complete.fixture';
import { checkoutData } from './fixtures/checkout.fixture';
import { writeDelivery } from './fixtures/delivery.fixture';

test('PostgreSQL: predarea cere ambalare pentru fiecare serviciu și finalizarea este atomică', async () => {
  for (const service of ['DINE_IN', 'TAKEAWAY', 'PICKUP', 'DELIVERY'] as const) {
    const f = await createPackingSessionFixture(service);
    try {
      assert.equal(f.session.handoverRequired, true);
      await assert.rejects(
        f.txA((tx) =>
          tx.packingSession.update({
            where: { id: f.session.id },
            data: { handoverRequired: false },
          }),
        ),
        /permission denied|immutable/,
      );
      for (const status of ['PREPARING', 'READY'])
        await f.txA((tx) => advanceKitchenBatch(tx, f.ticket.id, f.a.user.id, status));
      if (service === 'DELIVERY') {
        await f.txA((tx) =>
          writeDelivery(tx, f.ticket.orderId, {
            toStatus: 'ASSIGNED',
            courierUserId: f.a.user.id,
          }),
        );
        await assert.rejects(
          f.txA((tx) =>
            writeDelivery(tx, f.ticket.orderId, {
              toStatus: 'PICKED_UP',
            }),
          ),
          /delivery pickup requires a prepared order/,
        );
      }
      const prepared = await f.txA((tx) =>
        tx.order.findUniqueOrThrow({ where: { id: f.ticket.orderId } }),
      );
      assert.equal(prepared.status, 'IN_PROGRESS');
      assert.equal(prepared.kitchenStatus, 'READY');
      const checkout = await checkoutData(f, prepared);
      await assert.rejects(
        f.txA((tx) => tx.checkout.create({ data: checkout })),
        /ready order/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.order.update({
            where: { id: prepared.id },
            data: { status: 'READY', version: { increment: 1 } },
          }),
        ),
        /handover requires completed packing/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.order.update({
            where: { id: prepared.id },
            data: { status: 'COMPLETED', version: { increment: 1 } },
          }),
        ),
        /invalid order transition|handover requires/,
      );
      await assert.rejects(
        f.txA(async (tx) => {
          const ready = await completePackingFixture(tx, prepared.id, f.a.user.id);
          assert.equal(ready.status, 'READY');
          assert.equal(ready.version, prepared.version + 1);
          throw new Error('rollback ambalare');
        }),
        /rollback ambalare/,
      );
      const unchanged = await f.txA((tx) =>
        tx.order.findUniqueOrThrow({ where: { id: prepared.id } }),
      );
      assert.equal(unchanged.version, prepared.version);
      assert.equal(unchanged.status, 'IN_PROGRESS');
      assert.equal((await f.txA((tx) => tx.packingSession.findFirstOrThrow())).status, 'WAITING');
      assert.equal(await f.txA((tx) => tx.packingCommand.count()), 0);
      const ready = await f.txA((tx) => completePackingFixture(tx, prepared.id, f.a.user.id));
      assert.equal(ready.status, 'READY');
      assert.equal(ready.version, prepared.version + 1);
      assert.equal(ready.total.toFixed(2), prepared.total.toFixed(2));
      assert.equal(
        (await f.txA((tx) => tx.inventoryReservation.findFirstOrThrow())).status,
        'PENDING',
      );
      const events = await f.txA((tx) =>
        tx.orderStatusEvent.findMany({
          where: { orderId: prepared.id, kind: 'PACKING' },
          orderBy: { createdAt: 'asc' },
        }),
      );
      assert.deepEqual(
        events.map((event) => [event.fromStatus, event.toStatus]),
        [
          ['WAITING', 'PACKING'],
          ['PACKING', 'READY'],
        ],
      );
      assert.equal(events[1]!.actorUserId, f.a.user.id);
      assert.equal(events[1]!.orderVersion, ready.version);
      await assert.rejects(
        f.txA((tx) =>
          tx.orderStatusEvent.create({
            data: {
              organizationId: f.a.organization.id,
              locationId: f.locationA.id,
              orderId: prepared.id,
              kind: 'PACKING',
              fromStatus: 'PACKING',
              toStatus: 'READY',
              actorUserId: f.a.user.id,
            },
          }),
        ),
        /atomic session transition/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.order.update({
            where: { id: prepared.id },
            data: { status: 'IN_PROGRESS', version: { increment: 1 } },
          }),
        ),
        /invalid order transition/,
      );
    } finally {
      await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
    }
  }
});
