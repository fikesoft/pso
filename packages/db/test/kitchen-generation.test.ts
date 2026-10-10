import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { publishKitchenFixture } from './fixtures/operations-kitchen.fixture';
test('PostgreSQL: generarea grupurilor este atomică, completă, izolată și imuabilă', async () => {
  const f = await createOperationsFixture();
  try {
    const draft = await f.createDraft();
    await assert.rejects(publishKitchenFixture(f, draft, { omitItems: true }));
    await assert.rejects(publishKitchenFixture(f, draft, { omitReservation: true }));
    assert.equal(await f.txA((tx) => tx.kitchenTicketBatch.count()), 0);
    assert.equal(await f.txA((tx) => tx.kitchenTicketBatchItem.count()), 0);
    const { ticket, item } = await publishKitchenFixture(f, draft);
    const batch = await f.txA((tx) => tx.kitchenTicketBatch.findFirstOrThrow());
    const membership = await f.txA((tx) => tx.kitchenTicketBatchItem.findFirstOrThrow());
    assert.equal(batch.ticketId, ticket.id);
    assert.equal(batch.stationId, null);
    assert.equal(batch.createdAt.getTime(), ticket.createdAt.getTime());
    assert.equal(membership.ticketItemId, item!.id);
    assert.equal(membership.batchId, batch.id);
    assert.equal(await f.runtime.kitchenTicketBatch.count(), 0);
    assert.equal(await f.runtime.kitchenTicketBatchItem.count(), 0);
    assert.equal(await f.txB((tx) => tx.kitchenTicketBatch.count()), 0);
    assert.equal(await f.txB((tx) => tx.kitchenTicketBatchItem.count()), 0);
    await assert.rejects(f.platform.kitchenTicketBatch.findMany(), /permission denied/);
    await assert.rejects(
      f.txA((tx) => tx.kitchenTicketBatch.updateMany({ data: { stationName: 'Rescris' } })),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) => tx.kitchenTicketBatchItem.deleteMany()),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) => tx.kitchenTicketBatch.create({ data: { ...batch, id: randomUUID() } })),
      /atomic ticket generation/,
    );
    await assert.rejects(
      f.txB((tx) => tx.kitchenTicketBatchItem.create({ data: membership })),
      /atomic ticket generation|row-level security/,
    );
    // A legitimate parent status update must not reopen its original generation transaction.
    await assert.rejects(
      f.txA(async (tx) => {
        await tx.kitchenTicket.update({
          where: { id: ticket.id },
          data: { status: 'PREPARING', version: 2, updatedByUserId: f.a.user.id },
        });
        await tx.order.update({
          where: { id: draft.order.id },
          data: {
            status: 'IN_PROGRESS',
            kitchenStatus: 'PREPARING',
            version: 3,
            updatedByUserId: f.a.user.id,
          },
        });
        await tx.kitchenTicketBatchItem.create({ data: membership });
      }),
      /atomic ticket generation/,
    );
    assert.equal(
      (await f.txA((tx) => tx.kitchenTicket.findUniqueOrThrow({ where: { id: ticket.id } })))
        .status,
      'QUEUED',
    );
    await f.txA(async (tx) => {
      await tx.kitchenTicket.update({
        where: { id: ticket.id },
        data: { status: 'PREPARING', version: 2, updatedByUserId: f.a.user.id },
      });
      await tx.order.update({
        where: { id: draft.order.id },
        data: {
          status: 'IN_PROGRESS',
          kitchenStatus: 'PREPARING',
          version: 3,
          updatedByUserId: f.a.user.id,
        },
      });
    });
    const progressed = await f.txA((tx) => tx.kitchenTicketBatch.findFirstOrThrow());
    assert.deepEqual(progressed, {
      ...batch,
      status: 'PREPARING',
      version: 2,
      updatedAt: progressed.updatedAt,
    });
    assert.deepEqual(await f.txA((tx) => tx.kitchenTicketBatchItem.findFirstOrThrow()), membership);
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
