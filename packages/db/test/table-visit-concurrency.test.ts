import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVisitFixture } from './fixtures/table-visit.fixture';
import { createTable, tableData, updateTable } from './fixtures/dining-table.fixture';
import { responsibilityRace } from './fixtures/responsibility-race.fixture';

test('PostgreSQL real: deschidere/arhivare și închidere/comandă pe conexiuni independente', async (t) => {
  const f = await createVisitFixture();
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const mode of [
        'OPEN_OPEN',
        'OPEN_ARCHIVE',
        'ARCHIVE_OPEN',
        'CLOSE_ORDER',
        'ORDER_CLOSE',
      ] as const) {
        await t.test(`${isolationLevel}: ${mode}`, async () => {
          const table = await f.txA((tx) => createTable(tx, tableData(f)));
          const visit =
            mode === 'CLOSE_ORDER' || mode === 'ORDER_CLOSE'
              ? await f.txA((tx) => f.open(tx, table.id))
              : null;
          const [before] = await f.runtime.$queryRaw<Array<{ deadlocks: bigint }>>`
            SELECT deadlocks FROM pg_stat_database WHERE datname=current_database()`;
          const result = await responsibilityRace({
            organizationId: f.a.organization.id,
            actor: f.a.user.id,
            isolationLevel,
            snapshot: (tx) => tx.tableVisit.count({ where: { tableId: table.id } }),
            winner: (tx) =>
              mode === 'ARCHIVE_OPEN'
                ? updateTable(tx, table.id, f.a.user.id, 'ARCHIVE')
                : mode === 'CLOSE_ORDER'
                  ? f.record(tx, visit!.id, 'CLOSE')
                  : mode === 'ORDER_CLOSE'
                    ? f.linked(tx, visit!.id)
                    : f.open(tx, table.id),
            loser: (tx) =>
              mode === 'OPEN_ARCHIVE'
                ? updateTable(tx, table.id, f.a.user.id, 'ARCHIVE')
                : mode === 'CLOSE_ORDER'
                  ? f.linked(tx, visit!.id)
                  : mode === 'ORDER_CLOSE'
                    ? f.record(tx, visit!.id, 'CLOSE')
                    : f.open(tx, table.id),
          });
          assert.equal(result.status, 'rejected');
          if (result.status === 'rejected') {
            const [after] = await f.runtime.$queryRaw<Array<{ deadlocks: bigint }>>`
              SELECT deadlocks FROM pg_stat_database WHERE datname=current_database()`;
            assert.equal(
              after!.deadlocks,
              before!.deadlocks,
              'PostgreSQL nu trebuie să detecteze un deadlock',
            );
            // Prisma P2034 uses the same message for serialization and deadlocks.
            // Inspect its underlying SQLSTATE when the adapter preserves it.
            const originalCode = result.reason?.meta?.driverAdapterError?.cause?.originalCode;
            if (originalCode) assert.notEqual(originalCode, '40P01');
            assert.match(
              String(result.reason),
              /serializ|write conflict|unique|constraint|open visit|open orders|initial visit|open scoped/i,
            );
          }
          const visits = await f.txA((tx) =>
            tx.tableVisit.findMany({ where: { tableId: table.id } }),
          );
          assert.equal(visits.length, mode === 'ARCHIVE_OPEN' ? 0 : 1);
          if (visit) {
            assert.equal(visits[0]!.status, mode === 'CLOSE_ORDER' ? 'CLOSED' : 'OPEN');
            assert.equal(
              await f.txA((tx) => tx.order.count({ where: { tableVisitId: visit.id } })),
              mode === 'CLOSE_ORDER' ? 0 : 1,
            );
          }
        });
      }
    }
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
