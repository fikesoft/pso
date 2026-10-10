import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient, withTenantTransaction } from '../src';
import { createKitchenCoursesFixture } from './fixtures/kitchen-courses.fixture';
import { advanceKitchenBatch } from './fixtures/kitchen-batches.fixture';

test('PostgreSQL: lansarea atomică are proveniență, istoric imuabil și izolare', async () => {
  const f = await createKitchenCoursesFixture();
  try {
    const input = {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      ticketId: f.ticket.id,
      actorUserId: f.a.user.id,
      requestKey: randomUUID(),
      status: 'SUCCEEDED',
      course: '2',
      requestHash: 'c'.repeat(64),
      expectedVersion: 1,
    };
    await assert.rejects(f.txB((tx) => tx.kitchenCourseCommand.create({ data: input })));
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenCourseCommand.create({ data: { ...input, locationId: f.locationA2.id } }),
      ),
      /scoped ticket/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenCourseCommand.create({ data: { ...input, actorUserId: f.b.user.id } }),
      ),
      /scoped actor/,
    );
    await assert.rejects(
      f.txA(async (tx) => {
        await tx.kitchenCourseCommand.create({ data: input });
        throw new Error('rollback sintetic');
      }),
      /rollback sintetic/,
    );
    assert.equal(await f.txA((tx) => tx.kitchenCourseCommand.count()), 0);
    assert.equal(
      await f.txA((tx) =>
        tx.kitchenTicketBatch.count({ where: { courseNumber: 2, firedAt: null } }),
      ),
      2,
    );
    const before = await f.txA((tx) => tx.inventoryReservation.count());
    const result = await f.txA((tx) =>
      tx.kitchenCourseCommand.create({
        data: {
          ...input,
          batchIds: [randomUUID()],
          resultVersion: 900,
          createdAt: new Date('2000-01-01'),
        },
      }),
    );
    assert.equal(result.resultVersion, 2);
    assert.equal(result.batchIds.length, 2);
    assert.ok(result.createdAt.getTime() >= f.ticket.createdAt.getTime());
    const batches = await f.txA((tx) => tx.kitchenTicketBatch.findMany());
    for (const batch of batches.filter((row) => row.courseNumber === 2)) {
      assert.ok(result.batchIds.includes(batch.id));
      assert.equal(batch.firedAt!.getTime(), result.createdAt.getTime());
      assert.equal(batch.fireCommandId, result.id);
      assert.equal(batch.version, 2);
      assert.equal(batch.status, 'QUEUED');
    }
    const parent = await f.txA((tx) =>
      tx.kitchenTicket.findUniqueOrThrow({ where: { id: f.ticket.id } }),
    );
    assert.equal(parent.version, 2);
    assert.equal(parent.status, 'QUEUED');
    assert.equal(await f.txA((tx) => tx.inventoryReservation.count()), before);
    assert.equal(await f.runtime.kitchenCourseCommand.count(), 0);
    assert.equal(await f.txB((tx) => tx.kitchenCourseCommand.count()), 0);
    await assert.rejects(f.platform.kitchenCourseCommand.count(), /permission denied/);
    await assert.rejects(f.auth.kitchenCourseCommand.count(), /permission denied/);
    await assert.rejects(
      f.txA((tx) => tx.kitchenCourseCommand.deleteMany()),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) => tx.kitchenCourseCommand.updateMany({ data: { course: 'ALL' } })),
      /permission denied/,
    );
    const held = batches.find((row) => row.courseNumber === 3)!;
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenTicketBatch.update({
          where: { id: held.id },
          data: {
            firedAt: result.createdAt,
            fireCommandId: result.id,
            version: 2,
            updatedByUserId: f.a.user.id,
          },
        }),
      ),
      /atomic immutable command/,
    );
    await f.txA((tx) => advanceKitchenBatch(tx, result.batchIds[0]!, f.a.user.id, 'PREPARING'));
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenCourseCommand.create({
          data: { ...input, requestKey: randomUUID(), expectedVersion: 3 },
        }),
      ),
      /pending batches/,
    );
    const all = await f.txA((tx) =>
      tx.kitchenCourseCommand.create({
        data: { ...input, requestKey: randomUUID(), expectedVersion: 3, course: 'ALL' },
      }),
    );
    assert.equal(all.batchIds.length, 4);
    assert.equal(all.resultVersion, 4);
    assert.deepEqual(
      await f.txA((tx) => tx.kitchenCourseCommand.findUniqueOrThrow({ where: { id: result.id } })),
      result,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});

test('PostgreSQL: concurența și retragerea tentativei nu permit lansări duble', async () => {
  const f = await createKitchenCoursesFixture(false);
  const concurrent = createDatabaseClient(process.env.TEST_DATABASE_URL!, 2);
  try {
    const base = {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      ticketId: f.ticket.id,
      actorUserId: f.a.user.id,
    };
    const key = randomUUID();
    await f.txA((tx) =>
      tx.kitchenCourseCommand.create({ data: { ...base, requestKey: key, status: 'RETIRED' } }),
    );
    const input = {
      ...base,
      status: 'SUCCEEDED',
      course: '1',
      expectedVersion: 1,
      requestHash: 'd'.repeat(64),
    };
    await assert.rejects(
      f.txA((tx) => tx.kitchenCourseCommand.create({ data: { ...input, requestKey: key } })),
      /Unique constraint/,
    );
    assert.equal(
      (await f.txA((tx) => tx.kitchenTicket.findUniqueOrThrow({ where: { id: f.ticket.id } })))
        .version,
      1,
    );
    const results = await Promise.allSettled(
      [1, 2].map((course) =>
        withTenantTransaction(
          concurrent,
          { organizationId: f.a.organization.id, userId: f.a.user.id },
          (tx) =>
            tx.kitchenCourseCommand.create({
              data: { ...input, course: String(course), requestKey: randomUUID() },
            }),
        ),
      ),
    );
    assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
    assert.equal(results.filter((row) => row.status === 'rejected').length, 1);
    assert.equal(
      await f.txA((tx) => tx.kitchenCourseCommand.count({ where: { status: 'SUCCEEDED' } })),
      1,
    );
    assert.equal(
      await f.txA((tx) =>
        tx.kitchenTicketBatch.count({
          where: { courseNumber: { not: 0 }, firedAt: { not: null } },
        }),
      ),
      1,
    );
  } finally {
    await Promise.all([
      concurrent.$disconnect(),
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
    ]);
  }
});
