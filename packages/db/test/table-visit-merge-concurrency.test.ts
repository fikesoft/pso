import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVisitFixture } from './fixtures/table-visit.fixture';
import { createTable, tableData } from './fixtures/dining-table.fixture';
import { mergeVisits } from './fixtures/table-visit-merge.fixture';
import { responsibilityRace } from './fixtures/responsibility-race.fixture';
test('PostgreSQL: unire concurentă cu închidere, comandă, mutare și altă unire', async (t) => {
  const f = await createVisitFixture();
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const mode of [
        'MERGE_CLOSE',
        'CLOSE_MERGE',
        'MERGE_ORDER',
        'ORDER_MERGE',
        'MERGE_MOVE',
        'MOVE_MERGE',
        'MERGE_MERGE',
      ] as const) {
        await t.test(`${isolationLevel}: ${mode}`, async () => {
          const sourceTable = await f.txA((tx) => createTable(tx, tableData(f)));
          const targetTable = await f.txA((tx) => createTable(tx, tableData(f)));
          const otherTable = await f.txA((tx) => createTable(tx, tableData(f)));
          const source = await f.txA((tx) => f.open(tx, sourceTable.id));
          const target = await f.txA((tx) => f.open(tx, targetTable.id));
          const other =
            mode === 'MERGE_MERGE' ? await f.txA((tx) => f.open(tx, otherTable.id)) : null;
          if (mode === 'MERGE_CLOSE') await f.txA((tx) => f.linked(tx, source.id));
          const result = await responsibilityRace({
            organizationId: f.a.organization.id,
            actor: f.a.user.id,
            isolationLevel,
            snapshot: (tx) => tx.tableVisit.count(),
            winner: (tx) =>
              mode === 'CLOSE_MERGE'
                ? f.record(tx, target.id, 'CLOSE')
                : mode === 'ORDER_MERGE'
                  ? f.linked(tx, source.id)
                  : mode === 'MOVE_MERGE'
                    ? f.record(tx, source.id, 'MOVED', {
                        targetTableId: otherTable.id,
                        reason: 'Mutare prima',
                      })
                    : mergeVisits(tx, source.id, target.id, f.a.user.id),
            loser: (tx) =>
              mode === 'MERGE_CLOSE'
                ? f.record(tx, target.id, 'CLOSE')
                : mode === 'MERGE_ORDER'
                  ? f.linked(tx, source.id)
                  : mode === 'MERGE_MOVE'
                    ? f.record(tx, source.id, 'MOVED', {
                        targetTableId: otherTable.id,
                        reason: 'Mutare concurentă',
                        previousVersion: 1,
                        resultVersion: 2,
                      })
                    : mergeVisits(tx, source.id, other?.id ?? target.id, f.a.user.id, {
                        sourceVersion: 1,
                        targetVersion: 1,
                      }),
          });
          const success = mode === 'ORDER_MERGE' && isolationLevel === 'ReadCommitted';
          assert.equal(result.status, success ? 'fulfilled' : 'rejected');
          if (result.status === 'rejected')
            assert.match(
              String(result.reason),
              /open|current|root changed|serializ|write conflict/i,
            );
          const saved = await f.txA((tx) =>
            tx.tableVisit.findUniqueOrThrow({ where: { id: source.id } }),
          );
          const merged = mode.startsWith('MERGE_') || success;
          assert.equal(saved.status, merged ? 'MERGED' : 'OPEN');
          if (merged) assert.equal(saved.mergedIntoVisitId, target.id);
          assert.equal(
            await f.txA((tx) => tx.tableVisitMerge.count({ where: { sourceVisitId: source.id } })),
            merged ? 1 : 0,
          );
        });
      }
    }
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
