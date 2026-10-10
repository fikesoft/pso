import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { writeDelivery } from './fixtures/delivery.fixture';

test('PostgreSQL real: livrările concurente păstrează un singur rezultat și eveniment', async (t) => {
  const f = await createOperationsFixture();
  const clients = [
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
  ];
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const duplicateKey of [false, true]) {
        await t.test(`${isolationLevel}; cheie duplicată=${duplicateKey}`, async () => {
          const draft = await f.createDraft();
          const order = await f.txA((tx) =>
            tx.order.update({
              where: { id: draft.order.id },
              data: { serviceType: 'DELIVERY', status: 'CONFIRMED', version: { increment: 1 } },
            }),
          );
          const key = randomUUID();
          let release!: () => void;
          let abort!: (error: Error) => void;
          const barrier = new Promise<void>((resolve, reject) => {
            release = resolve;
            abort = reject;
          });
          const pids = new Set<number>();
          const timer = setTimeout(() => abort(new Error('Bariera concurentă a expirat')), 5000);
          try {
            const outcomes = await Promise.allSettled(
              clients.map((client, index) =>
                client.$transaction(
                  async (tx) => {
                    await tx.$queryRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true),set_config('app.user_id',${f.a.user.id},true)`;
                    const [row] = await tx.$queryRaw<Array<{ pid: number }>>`
                      SELECT pg_backend_pid() AS pid`;
                    // Establish both snapshots before either command starts.
                    await tx.order.findUniqueOrThrow({ where: { id: order.id } });
                    pids.add(row!.pid);
                    if (pids.size === 2) release();
                    await barrier;
                    return writeDelivery(tx, order.id, {
                      toStatus: 'FAILED',
                      reason: `Eșec sintetic ${index}`,
                      orderVersion: order.version + 1,
                      operation: { requestKey: duplicateKey ? key : randomUUID() },
                    });
                  },
                  { isolationLevel, timeout: 15000 },
                ),
              ),
            );
            assert.equal(pids.size, 2);
            assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
            const saved = await f.txA((tx) =>
              tx.order.findUniqueOrThrow({ where: { id: order.id } }),
            );
            assert.equal(saved.version, order.version + 1);
            assert.equal(saved.deliveryStatus, 'FAILED');
            assert.equal(
              await f.txA((tx) => tx.deliveryOperation.count({ where: { orderId: order.id } })),
              1,
            );
            assert.equal(
              await f.txA((tx) =>
                tx.orderStatusEvent.count({ where: { orderId: order.id, kind: 'DELIVERY' } }),
              ),
              1,
            );
          } finally {
            clearTimeout(timer);
            release();
          }
        });
      }
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
