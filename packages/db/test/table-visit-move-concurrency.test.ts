import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVisitFixture } from './fixtures/table-visit.fixture';
import { createTable, tableData, updateTable } from './fixtures/dining-table.fixture';
import { responsibilityRace } from './fixtures/responsibility-race.fixture';
test('PostgreSQL: mutare concurentă cu ocupare, arhivare și altă mutare', async (t) => {
  const f = await createVisitFixture();
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const mode of [
        'MOVE_OPEN',
        'OPEN_MOVE',
        'MOVE_ARCHIVE',
        'ARCHIVE_MOVE',
        'MOVE_MOVE',
      ] as const) {
        await t.test(`${isolationLevel}: ${mode}`, async () => {
          const source = await f.txA((tx) => createTable(tx, tableData(f)));
          const target = await f.txA((tx) => createTable(tx, tableData(f)));
          const other = await f.txA((tx) => createTable(tx, tableData(f)));
          const visit = await f.txA((tx) => f.open(tx, source.id));
          const result = await responsibilityRace({
            organizationId: f.a.organization.id,
            actor: f.a.user.id,
            isolationLevel,
            snapshot: (tx) => tx.tableVisit.count(),
            winner: (tx) =>
              mode === 'OPEN_MOVE'
                ? f.open(tx, target.id)
                : mode === 'ARCHIVE_MOVE'
                  ? updateTable(tx, target.id, f.a.user.id, 'ARCHIVE')
                  : f.record(tx, visit.id, 'MOVED', {
                      targetTableId: target.id,
                      reason: 'Mutare câștigătoare',
                    }),
            loser: (tx) =>
              mode === 'MOVE_OPEN'
                ? f.open(tx, target.id)
                : mode === 'MOVE_ARCHIVE'
                  ? updateTable(tx, target.id, f.a.user.id, 'ARCHIVE')
                  : f.record(tx, visit.id, 'MOVED', {
                      targetTableId: mode === 'MOVE_MOVE' ? other.id : target.id,
                      reason: 'Mutare concurentă',
                      previousVersion: 1,
                      resultVersion: 2,
                    }),
          });
          assert.equal(result.status, 'rejected');
          if (result.status === 'rejected')
            assert.match(
              String(result.reason),
              /free active|serializ|write conflict|open visit|unique|constraint|initial visit/i,
            );
          const saved = await f.txA((tx) =>
            tx.tableVisit.findUniqueOrThrow({ where: { id: visit.id } }),
          );
          assert.equal(
            saved.tableId,
            mode === 'OPEN_MOVE' || mode === 'ARCHIVE_MOVE' ? source.id : target.id,
          );
          assert.equal(
            await f.txA((tx) =>
              tx.tableVisit.count({ where: { tableId: target.id, status: 'OPEN' } }),
            ),
            mode === 'ARCHIVE_MOVE' ? 0 : 1,
          );
        });
      }
    }
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
