import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createVisitFixture } from './fixtures/table-visit.fixture';
import { createTable, tableData } from './fixtures/dining-table.fixture';
import { mergeVisits } from './fixtures/table-visit-merge.fixture';
test('PostgreSQL: unirea atomică păstrează comenzile și agregă servirea', async () => {
  const f = await createVisitFixture();
  try {
    const source = await f.txA((tx) => f.open(tx));
    const targetTable = await f.txA((tx) => createTable(tx, tableData(f)));
    const target = await f.txA((tx) => f.open(tx, targetTable.id));
    const order = await f.txA((tx) => f.linked(tx, source.id));
    await f.txA((tx) => f.record(tx, source.id, 'BILL_REQUESTED'));
    await assert.rejects(
      f.txA((tx) => mergeVisits(tx, source.id, source.id, f.a.user.id)),
      /distinct visits/,
    );
    await assert.rejects(
      f.txA((tx) => mergeVisits(tx, source.id, target.id, f.b.user.id)),
      /scoped actor/,
    );
    await assert.rejects(
      f.txA((tx) => mergeVisits(tx, source.id, target.id, f.a.user.id, { sourceVersion: 1 })),
      /current open versions/,
    );
    await assert.rejects(
      f.txA((tx) =>
        mergeVisits(tx, source.id, target.id, f.a.user.id, { locationId: f.locationA2.id }),
      ),
      /scoped merge visit/,
    );
    await assert.rejects(
      f.txB((tx) =>
        tx.tableVisitMerge.create({
          data: {
            organizationId: source.organizationId,
            locationId: source.locationId,
            sourceVisitId: source.id,
            targetVisitId: target.id,
            sourceVersion: 2,
            targetVersion: 1,
            requestKey: randomUUID(),
            requestHash: 'a'.repeat(64),
            sourceEventId: randomUUID(),
            targetEventId: randomUUID(),
            actorUserId: f.b.user.id,
            reason: 'Tentativă din alt tenant',
          },
        }),
      ),
      /scoped actor|row-level|scoped merge visit/,
    );
    await f.txA((tx) => f.record(tx, target.id, 'GUEST_COUNT_CHANGED', { guestCount: 999 }));
    await assert.rejects(
      f.txA((tx) => mergeVisits(tx, source.id, target.id, f.a.user.id)),
      /valid guest total/,
    );
    await f.txA((tx) => f.record(tx, target.id, 'GUEST_COUNT_CHANGED', { guestCount: 2 }));
    const merge = await f.txA((tx) => mergeVisits(tx, source.id, target.id, f.a.user.id));
    const [savedSource, savedTarget] = await f.txA((tx) =>
      Promise.all([
        tx.tableVisit.findUniqueOrThrow({ where: { id: source.id } }),
        tx.tableVisit.findUniqueOrThrow({ where: { id: target.id } }),
      ]),
    );
    assert.equal(savedSource.status, 'MERGED');
    assert.equal(savedSource.mergedIntoVisitId, target.id);
    assert.equal(savedTarget.status, 'OPEN');
    assert.equal(savedTarget.guestCount, 4);
    assert.equal(savedTarget.billRequested, true);
    assert.equal(savedTarget.waiterUserId, target.waiterUserId);
    assert.equal(savedTarget.version, 4);
    assert.equal(await f.txA((tx) => tx.tableVisitMerge.count()), 1);
    assert.equal(await f.txB((tx) => tx.tableVisitMerge.count()), 0);
    assert.equal(await f.runtime.tableVisitMerge.count(), 0);
    const events = await f.txA((tx) =>
      tx.tableVisitEvent.findMany({ where: { mergeId: merge.id } }),
    );
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.kind).sort(), ['MERGED', 'MERGE_RECEIVED']);
    const savedOrder = await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
    assert.equal(savedOrder.tableVisitId, source.id);
    assert.equal(savedOrder.tableLabel, f.table.code);
    await assert.rejects(
      f.txA((tx) => f.record(tx, target.id, 'CLOSE')),
      /open orders/,
    );
    await assert.rejects(
      f.txA((tx) => f.linked(tx, source.id)),
      /open scoped visit/,
    );
    await f.txA((tx) =>
      tx.order.update({
        where: { id: order.id },
        data: { notes: 'Comandă după unire', version: 2 },
      }),
    );
    await f.txA((tx) => f.open(tx, f.table.id));
    await assert.rejects(
      f.txA((tx) => tx.tableVisitMerge.delete({ where: { id: merge.id } })),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) => tx.tableVisit.update({ where: { id: source.id }, data: { status: 'OPEN' } })),
      /immutable/,
    );
    const thirdTable = await f.txA((tx) => createTable(tx, tableData(f)));
    const third = await f.txA((tx) => f.open(tx, thirdTable.id));
    await f.txA((tx) => mergeVisits(tx, target.id, third.id, f.a.user.id));
    const [root] = await f.txA(
      (tx) =>
        tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT public.table_visit_root(${source.organizationId}::uuid,${source.locationId}::uuid,${source.id}::uuid) AS id`,
    );
    assert.equal(root!.id, third.id);
    const members = await f.txA(
      (tx) =>
        tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM public.table_visit_members(${source.organizationId}::uuid,${source.locationId}::uuid,${third.id}::uuid)`,
    );
    assert.deepEqual(members.map((v) => v.id).sort(), [source.id, target.id, third.id].sort());
    await assert.rejects(
      f.txA((tx) => f.record(tx, third.id, 'CLOSE')),
      /open orders/,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
