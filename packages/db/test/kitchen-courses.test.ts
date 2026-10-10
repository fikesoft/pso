import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceKitchenBatch } from './fixtures/kitchen-batches.fixture';
import { createKitchenCoursesFixture } from './fixtures/kitchen-courses.fixture';

test('PostgreSQL: etapele sunt snapshoturi, grupate pe stație, izolate și blocate până la lansare', async () => {
  const f = await createKitchenCoursesFixture();
  try {
    const batches = await f.txA((tx) => tx.kitchenTicketBatch.findMany());
    assert.equal(batches.length, 8);
    const items = await f.txA((tx) => tx.kitchenTicketItem.findMany());
    const members = await f.txA((tx) => tx.kitchenTicketBatchItem.findMany());
    for (const item of items) {
      assert.equal(item.courseNumber, item.position % 4);
      const batch = batches.find(
        (row) => row.id === members.find((m) => m.ticketItemId === item.id)!.batchId,
      )!;
      assert.equal(batch.courseNumber, item.courseNumber);
      assert.equal(batch.stationId === null, item.position >= 4);
      assert.equal(
        batch.firedAt?.toISOString() ?? null,
        item.courseNumber === 0 ? f.ticket.createdAt.toISOString() : null,
      );
    }
    assert.equal(await f.runtime.kitchenTicketBatch.count(), 0);
    assert.equal(await f.txB((tx) => tx.kitchenTicketBatch.count()), 0);
    assert.equal(await f.txB((tx) => tx.kitchenTicketItem.count()), 0);
    const held = batches.find((row) => row.courseNumber === 2)!;
    await assert.rejects(
      f.txA((tx) => advanceKitchenBatch(tx, held.id, f.a.user.id, 'PREPARING')),
      /invalid kitchen batch/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenTicketBatch.update({ where: { id: held.id }, data: { firedAt: new Date() } }),
      ),
      /atomic immutable command/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenTicketItem.update({ where: { id: items[0]!.id }, data: { courseNumber: 2 } }),
      ),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.orderItem.update({ where: { id: items[0]!.orderItemId }, data: { courseNumber: 2 } }),
      ),
      /only draft/,
    );
    const [policies] = await f.runtime.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM pg_policies WHERE policyname='migration_course_backfill'`;
    assert.equal(policies!.count, 0n);
    const immediate = batches.filter((row) => row.courseNumber === 0);
    await f.txA((tx) => advanceKitchenBatch(tx, immediate[0]!.id, f.a.user.id, 'PREPARING'));
    await f.txA((tx) => advanceKitchenBatch(tx, immediate[0]!.id, f.a.user.id, 'READY'));
    await f.txA((tx) => advanceKitchenBatch(tx, immediate[1]!.id, f.a.user.id, 'PREPARING'));
    const parent = await f.txA((tx) =>
      advanceKitchenBatch(tx, immediate[1]!.id, f.a.user.id, 'READY'),
    );
    assert.equal(parent.status, 'PARTIALLY_READY');
    assert.equal(
      await f.txA((tx) =>
        tx.kitchenTicketBatch.count({ where: { firedAt: null, status: 'QUEUED' } }),
      ),
      6,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});

test('PostgreSQL: etapele fără stație rămân separate, iar progresul integral nu le lansează', async () => {
  const f = await createKitchenCoursesFixture(false);
  try {
    const batches = await f.txA((tx) => tx.kitchenTicketBatch.findMany());
    assert.equal(batches.length, 4);
    assert.ok(batches.every((batch) => batch.stationId === null));
    await assert.rejects(
      f.txA(async (tx) => {
        await tx.kitchenTicket.update({
          where: { id: f.ticket.id },
          data: { status: 'PREPARING', version: 2, updatedByUserId: f.a.user.id },
        });
        await tx.order.update({
          where: { id: f.ticket.orderId },
          data: {
            status: 'IN_PROGRESS',
            kitchenStatus: 'PREPARING',
            version: 4,
            updatedByUserId: f.a.user.id,
          },
        });
      }),
      /all station batches/,
    );
    const immediate = batches.find((row) => row.courseNumber === 0)!;
    assert.equal(immediate.id, f.ticket.id);
    await f.txA((tx) => advanceKitchenBatch(tx, immediate.id, f.a.user.id, 'PREPARING'));
    const partial = await f.txA((tx) =>
      advanceKitchenBatch(tx, immediate.id, f.a.user.id, 'READY'),
    );
    assert.equal(partial.status, 'PARTIALLY_READY');
    const draft = await f.createDraft();
    await assert.rejects(
      f.txA((tx) =>
        tx.orderItem.update({ where: { id: draft.item.id }, data: { courseNumber: 4 } }),
      ),
      /constraint/,
    );
    await f.txA((tx) =>
      tx.orderItem.update({ where: { id: draft.item.id }, data: { courseNumber: 3 } }),
    );
    assert.equal(
      (await f.txA((tx) => tx.orderItem.findUniqueOrThrow({ where: { id: draft.item.id } })))
        .courseNumber,
      3,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
