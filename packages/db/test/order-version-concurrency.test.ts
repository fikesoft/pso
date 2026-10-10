import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';

test('PostgreSQL real: două editări cu aceeași versiune nu suprascriu rezultatul câștigător', async (t) => {
  const f = await createOperationsFixture();
  const clients = [
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
  ];
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      await t.test(isolationLevel, async () => {
        const draft = await f.createDraft();
        let release!: () => void;
        let rejectBarrier!: (error: Error) => void;
        const barrier = new Promise<void>((resolve, reject) => {
          release = resolve;
          rejectBarrier = reject;
        });
        const pids = new Set<number>();
        const timer = setTimeout(
          () => rejectBarrier(new Error('Bariera editărilor a expirat')),
          5000,
        );
        try {
          const outcomes = await Promise.allSettled(
            clients.map((client, index) =>
              client.$transaction(
                async (tx) => {
                  await tx.$queryRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true)`;
                  const [connection] = await tx.$queryRaw<
                    Array<{ pid: number }>
                  >`SELECT pg_backend_pid() AS pid`;
                  const snapshot = await tx.order.findUniqueOrThrow({
                    where: { id: draft.order.id },
                  });
                  assert.equal(snapshot.version, 1);
                  pids.add(connection!.pid);
                  if (pids.size === 2) release();
                  await barrier;
                  const result = await tx.order.updateMany({
                    where: { id: draft.order.id, version: snapshot.version },
                    data: {
                      notes: `Editarea ${index}`,
                      version: { increment: 1 },
                      updatedByUserId: f.a.user.id,
                    },
                  });
                  return { index, count: result.count };
                },
                { isolationLevel, timeout: 15000 },
              ),
            ),
          );
          assert.equal(pids.size, 2);
          const successes = outcomes.flatMap((outcome) =>
            outcome.status === 'fulfilled' && outcome.value.count === 1 ? [outcome.value] : [],
          );
          assert.equal(successes.length, 1);
          if (isolationLevel === 'ReadCommitted') {
            assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 2);
            assert.equal(
              outcomes.filter(
                (outcome) => outcome.status === 'fulfilled' && outcome.value.count === 0,
              ).length,
              1,
            );
          } else {
            const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
            assert.equal(failures.length, 1);
            assert.match(
              String(failures[0]!.reason),
              /serialize|serialization|write conflict|deadlock/i,
            );
          }
          const saved = await f.txA((tx) =>
            tx.order.findUniqueOrThrow({ where: { id: draft.order.id } }),
          );
          assert.equal(saved.version, 2);
          assert.equal(saved.notes, `Editarea ${successes[0]!.index}`);
          assert.equal(saved.total.toFixed(2), draft.order.total.toFixed(2));
          const events = await f.txA((tx) =>
            tx.orderRealtimeEvent.findMany({
              where: { orderId: draft.order.id },
              orderBy: { orderVersion: 'asc' },
            }),
          );
          assert.deepEqual(
            events.map((event) => [event.type, event.orderVersion]),
            [
              ['order.created', 1],
              ['order.updated', 2],
            ],
          );
          const stale = await f.txA((tx) =>
            tx.order.updateMany({
              where: { id: draft.order.id, version: 1 },
              data: { notes: 'Retry cu versiune veche', version: { increment: 1 } },
            }),
          );
          assert.equal(stale.count, 0);
          const final = await f.txA((tx) =>
            tx.order.findUniqueOrThrow({ where: { id: draft.order.id } }),
          );
          assert.equal(final.notes, saved.notes);
          assert.equal(final.version, 2);
          assert.equal(
            await f.txA((tx) =>
              tx.orderRealtimeEvent.count({ where: { orderId: draft.order.id } }),
            ),
            2,
          );
        } finally {
          clearTimeout(timer);
          release();
        }
      });
    }
  } finally {
    await Promise.all([
      ...clients.map((client) => client.$disconnect()),
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
    ]);
  }
});
