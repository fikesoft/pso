import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createKitchenBatchesFixture,
  advanceKitchenBatch,
} from './fixtures/kitchen-batches.fixture';
test('PostgreSQL: fiecare stație și grupul neatribuit sunt obligatorii pentru READY', async () => {
  const f = await createKitchenBatchesFixture();
  try {
    const members = await f.txA((tx) =>
      tx.kitchenTicketBatchItem.findMany({ where: { ticketId: f.ticket.id } }),
    );
    assert.equal(members.length, 2);
    assert.ok(members.find((item) => item.batchId === f.assigned.id)!.routingCommandId);
    assert.equal(members.find((item) => item.batchId === f.unassigned.id)!.routingCommandId, null);
    await assert.rejects(
      f.txA((tx) => advanceKitchenBatch(tx, f.assigned.id, f.a.user.id, 'READY')),
      /invalid kitchen batch/,
    );
    await assert.rejects(
      f.txB((tx) =>
        tx.kitchenTicketBatch.update({
          where: { id: f.assigned.id },
          data: { status: 'PREPARING', version: 2, updatedByUserId: f.b.user.id },
        }),
      ),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenTicketBatch.update({
          where: { id: f.assigned.id },
          data: { status: 'PREPARING', version: 2, updatedByUserId: f.a.user.id },
        }),
      ),
      /atomic parent/,
    );
    await f.txA((tx) => advanceKitchenBatch(tx, f.assigned.id, f.a.user.id, 'PREPARING'));
    const partial = await f.txA((tx) =>
      advanceKitchenBatch(tx, f.assigned.id, f.a.user.id, 'READY'),
    );
    assert.equal(partial.status, 'PARTIALLY_READY');
    // Bypassing the HTTP router cannot mark the order ready while the unassigned batch waits.
    await assert.rejects(
      f.txA(async (tx) => {
        await tx.kitchenTicket.update({
          where: { id: f.ticket.id },
          data: { status: 'READY', version: { increment: 1 }, updatedByUserId: f.a.user.id },
        });
        await tx.order.update({
          where: { id: f.ticket.orderId },
          data: {
            status: 'IN_PROGRESS',
            kitchenStatus: 'READY',
            version: { increment: 1 },
            updatedByUserId: f.a.user.id,
          },
        });
      }),
      /all station batches/,
    );
    const preparing = await f.txA((tx) =>
      advanceKitchenBatch(tx, f.unassigned.id, f.a.user.id, 'PREPARING'),
    );
    assert.equal(preparing.status, 'PARTIALLY_READY');
    assert.equal(preparing.version, partial.version + 1);
    const ready = await f.txA((tx) =>
      advanceKitchenBatch(tx, f.unassigned.id, f.a.user.id, 'READY'),
    );
    assert.equal(ready.status, 'READY');
    assert.deepEqual(
      await f.txA((tx) => tx.kitchenTicketBatchItem.findMany({ where: { ticketId: f.ticket.id } })),
      members,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
