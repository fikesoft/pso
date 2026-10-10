import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseClient, withTenantTransaction } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { loadAuthorization } from '../../../apps/api/src/entities/tenant-access';
import { activeOrderPage } from '../../../apps/api/src/features/orders/model/order-active-page';

test('PostgreSQL: plata concurentă nu amestecă motivele active cu DTO, snapshot readonly și tenant izolat', async () => {
  const f = await createOperationsFixture();
  const cashShift = await openCashShiftFixture(f);
  const writer = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1);
  const context = {
    organizationId: f.a.organization.id,
    locationId: f.locationA.id,
    userId: f.a.user.id,
  };
  try {
    const draft = await f.createDraft();
    await f.txA((tx) =>
      tx.order.update({
        where: { id: draft.order.id },
        data: { status: 'CONFIRMED', version: { increment: 1 } },
      }),
    );
    let captured!: () => void, committed!: () => void;
    const ready = new Promise<void>((resolve) => {
      captured = resolve;
    });
    const written = new Promise<void>((resolve) => {
      committed = resolve;
    });
    const reader = withTenantTransaction(
      f.runtime,
      context,
      async (tx) => {
        const authorization = await loadAuthorization(tx, context.organizationId);
        const [pid] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        captured();
        await written;
        const page = await activeOrderPage(
          tx,
          {
            ...authorization,
            currentUser: authorization.users.find((user) => user.id === f.a.user.id)!,
          },
          context,
          50,
        );
        assert.equal(page.orders.length, 1);
        assert.deepEqual(page.orders[0]!.activeReasons, ['OPERATIONAL', 'PAYMENT_OUTSTANDING']);
        assert.equal(page.orders[0]!.paymentSummary.outstandingAmount, '10.01');
        assert.equal(page.orders[0]!.version, 2);
        return pid!.pid;
      },
      { readOnlySnapshot: true },
    );
    const mutation = (async () => {
      await ready;
      try {
        return await withTenantTransaction(writer, context, async (tx) => {
          const [pid] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
          await writeFinancialCommand(tx, draft.order.id, {
            cashShiftId: cashShift.id,
            payments: [{ amount: '10.01' }],
          });
          return pid!.pid;
        });
      } finally {
        committed();
      }
    })();
    const pids = await Promise.all([reader, mutation]);
    assert.notEqual(pids[0], pids[1]);
    await withTenantTransaction(
      f.runtime,
      context,
      async (tx) => {
        const authorization = await loadAuthorization(tx, context.organizationId);
        const page = await activeOrderPage(
          tx,
          {
            ...authorization,
            currentUser: authorization.users.find((user) => user.id === f.a.user.id)!,
          },
          context,
          50,
        );
        assert.deepEqual(page.orders[0]!.activeReasons, ['OPERATIONAL']);
        assert.equal(page.orders[0]!.paymentSummary.outstandingAmount, '0.00');
        assert.equal(page.orders[0]!.version, 3);
        assert.equal(await tx.orderRealtimeEvent.count(), 3);
        assert.equal(await tx.paymentOperation.count(), 1);
        assert.equal(
          await tx.auditEvent.count({ where: { action: { startsWith: 'orders.active' } } }),
          0,
        );
      },
      { readOnlySnapshot: true },
    );
    await assert.rejects(
      withTenantTransaction(
        f.runtime,
        context,
        async (tx) => {
          await tx.order.update({
            where: { id: draft.order.id },
            data: { notes: 'forbidden', version: { increment: 1 } },
          });
        },
        { readOnlySnapshot: true },
      ),
      /read-only transaction/,
    );
    assert.equal(await f.txB((tx) => tx.order.count()), 0);
    assert.equal(await f.runtime.order.count(), 0);
    const [reset] = await f.runtime.$queryRaw<Array<{ mode: string; level: string }>>`
      SELECT current_setting('transaction_read_only') AS mode,current_setting('transaction_isolation') AS level`;
    assert.deepEqual(reset, { mode: 'off', level: 'read committed' });
  } finally {
    await Promise.all([
      writer.$disconnect(),
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
    ]);
  }
});
