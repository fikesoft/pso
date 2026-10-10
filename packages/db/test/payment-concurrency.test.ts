import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import type { TenantTransaction } from '../src';
import { paymentSummary } from '../../../apps/api/src/entities/order';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { checkoutData, prepareCheckoutOrder, writeCheckout } from './fixtures/checkout.fixture';

test('PostgreSQL real: operațiuni financiare concurente fără supraplată sau rambursare dublă', async (t) => {
  const f = await createOperationsFixture();
  const cashShift = await openCashShiftFixture(f);
  const cashShiftB = await openCashShiftFixture(f, 'b');
  const cashShiftA2 = await openCashShiftFixture(f, 'a', f.locationA2.id);
  const clients = [
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
  ];
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const kind of ['COLLECT', 'REFUND'] as const) {
        await t.test(`${kind}: un singur câștigător la ${isolationLevel}`, async () => {
          const draft = await f.createDraft();
          let order = await f.txA((tx) =>
            tx.order.update({
              where: { id: draft.order.id },
              data: { status: 'CONFIRMED', version: { increment: 1 } },
            }),
          );
          let paymentId = '';
          if (kind === 'REFUND') {
            const paid = await f.txA((tx) =>
              writeFinancialCommand(tx, order.id, {
                cashShiftId: cashShift.id,
                payments: [{ amount: order.total.toFixed(2) }],
              }),
            );
            paymentId = paid.payments[0]!.id;
            order = await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
          }
          const backends = new Set<number>();
          let release!: () => void;
          let abort!: (error: Error) => void;
          const barrier = new Promise<void>((resolve, reject) => {
            release = resolve;
            abort = reject;
          });
          const timer = setTimeout(
            () => abort(new Error('Tranzacțiile nu au ajuns simultan la barieră')),
            5000,
          );
          const enter = async (tx: TenantTransaction) => {
            const [row] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            backends.add(row!.pid);
            if (backends.size === 2) release();
            await barrier;
          };
          try {
            const results = await Promise.allSettled(
              clients.map((client) =>
                client.$transaction(
                  async (tx) => {
                    await tx.$queryRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true),set_config('app.user_id',${f.a.user.id},true)`;
                    await enter(tx);
                    return writeFinancialCommand(tx, order.id, {
                      cashShiftId: cashShift.id,
                      operation: { orderVersion: order.version + 1 },
                      ...(kind === 'COLLECT'
                        ? { payments: [{ amount: order.total.toFixed(2) }] }
                        : { refunds: [{ paymentId, amount: order.total.toFixed(2) }] }),
                    });
                  },
                  { isolationLevel, timeout: 15000 },
                ),
              ),
            );
            assert.equal(backends.size, 2);
            assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
            const summary = await f.txA((tx) => paymentSummary(tx, order.id));
            assert.equal(summary.status, kind === 'COLLECT' ? 'PAID' : 'REFUNDED');
            assert.equal(
              await f.txA((tx) =>
                tx.paymentOperation.count({ where: { orderId: order.id, kind } }),
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
    await t.test(
      'checkout-ul blocat de o încasare recitește istoricul după obținerea lockului',
      async () => {
        const order = await prepareCheckoutOrder(f);
        const data = await checkoutData(f, order);
        let started!: () => void;
        let release!: () => void;
        const held = new Promise<void>((resolve) => {
          started = resolve;
        });
        const unblock = new Promise<void>((resolve) => {
          release = resolve;
        });
        const pids: number[] = [];
        const collection = clients[0]!.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true),set_config('app.user_id',${f.a.user.id},true)`;
            const [row] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            pids[0] = row!.pid;
            await writeFinancialCommand(tx, order.id, {
              cashShiftId: cashShift.id,
              payments: [{ amount: '1' }],
            });
            started();
            await unblock;
          },
          { timeout: 15000 },
        );
        await held;
        const checkout = clients[1]!.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true),set_config('app.user_id',${f.a.user.id},true)`;
            const [row] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            pids[1] = row!.pid;
            return tx.checkout.create({ data });
          },
          { timeout: 15000 },
        );
        const outcomes = Promise.allSettled([collection, checkout]);
        let blockingPath: number[] | null = null;
        try {
          for (let attempt = 0; attempt < 100; attempt++) {
            if (pids[1]) {
              const rows = await f.runtime.$queryRaw<
                Array<{ path: number[] }>
              >`WITH RECURSIVE waiters(pid,path) AS (
                SELECT ${pids[1]}::int,ARRAY[${pids[1]}::int]
                UNION ALL SELECT blocker,array_append(w.path,blocker) FROM waiters w
                CROSS JOIN LATERAL unnest(pg_blocking_pids(w.pid)) blocker
                WHERE NOT blocker=ANY(w.path)
              ) SELECT path FROM waiters WHERE pid=${pids[0]}::int LIMIT 1`;
              if (rows[0]) {
                blockingPath = rows[0].path;
                break;
              }
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        } finally {
          release();
        }
        const results = await outcomes;
        assert.ok(blockingPath, 'Checkout trebuie observat blocat de tranzacția financiară');
        t.diagnostic(`Lanț PostgreSQL de blocare checkout → încasare: ${blockingPath.join(' → ')}`);
        assert.equal(results[0]!.status, 'fulfilled');
        assert.equal(results[1]!.status, 'rejected');
        if (results[1]!.status === 'rejected')
          assert.match(String(results[1]!.reason), /financial history/);
        assert.equal(await f.txA((tx) => tx.checkout.count({ where: { orderId: order.id } })), 0);
      },
    );
    await t.test('rambursarea nu poate lega plăți din alt tenant sau altă locație', async () => {
      const local = await prepareCheckoutOrder(f);
      const paid = await writeCheckout(f, local, {
        mode: 'MANUAL',
        cashShiftId: cashShift.id,
        method: 'CARD',
        receivedAmount: local.total,
        changeAmount: '0',
      });
      const other = await f.createDraft('b');
      await f.txB((tx) =>
        tx.order.update({
          where: { id: other.order.id },
          data: { status: 'CONFIRMED', version: { increment: 1 } },
        }),
      );
      const foreign = await f.txB((tx) =>
        writeFinancialCommand(tx, other.order.id, {
          cashShiftId: cashShiftB.id,
          payments: [{ amount: '2' }],
        }),
      );
      await assert.rejects(
        f.txA((tx) =>
          writeFinancialCommand(tx, local.id, {
            cashShiftId: cashShift.id,
            refunds: [{ paymentId: foreign.payments[0]!.id, amount: '1' }],
          }),
        ),
        /remaining original payment/,
      );
      const elsewhere = await f.createDraft('a', f.locationA2.id);
      await f.txA((tx) =>
        tx.order.update({
          where: { id: elsewhere.order.id },
          data: { status: 'CONFIRMED', version: { increment: 1 } },
        }),
      );
      await f.txA((tx) =>
        writeFinancialCommand(tx, elsewhere.order.id, {
          cashShiftId: cashShiftA2.id,
          payments: [{ amount: '2' }],
        }),
      );
      await assert.rejects(
        f.txA((tx) =>
          writeFinancialCommand(tx, elsewhere.order.id, {
            cashShiftId: cashShiftA2.id,
            refunds: [{ paymentId: paid.payment!.id, amount: '1' }],
          }),
        ),
        /remaining original payment/,
      );
    });
  } finally {
    await Promise.all([
      ...clients.map((client) => client.$disconnect()),
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
    ]);
  }
});
