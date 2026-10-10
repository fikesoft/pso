import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVisitFixture } from './fixtures/table-visit.fixture';
import { createTable, tableData, updateTable } from './fixtures/dining-table.fixture';
test('PostgreSQL: mutarea păstrează vizita, comenzile și istoricul', async () => {
  const f = await createVisitFixture();
  try {
    const destination = await f.txA((tx) => createTable(tx, tableData(f)));
    const occupied = await f.txA((tx) => createTable(tx, tableData(f)));
    await f.txA((tx) => f.open(tx, occupied.id));
    const visit = await f.txA((tx) => f.open(tx));
    const order = await f.txA((tx) => f.linked(tx, visit.id));
    await f.txA((tx) => f.record(tx, visit.id, 'BILL_REQUESTED'));
    const move = (targetTableId: string) =>
      f.txA((tx) =>
        f.record(tx, visit.id, 'MOVED', {
          targetTableId,
          reason: 'Mutare solicitată de clienți',
        }),
      );
    const otherLocation = await f.txA((tx) =>
      createTable(tx, tableData(f, { locationId: f.locationA2.id })),
    );
    const foreign = await f.txB((tx) =>
      createTable(
        tx,
        tableData(f, {
          organizationId: f.b.organization.id,
          locationId: f.locationB.id,
          createdByUserId: f.b.user.id,
          updatedByUserId: f.b.user.id,
        }),
      ),
    );
    await assert.rejects(move(otherLocation.id), /scoped dining table/);
    await assert.rejects(move(foreign.id), /scoped dining table/);
    await assert.rejects(move(occupied.id), /free active destination/);
    await assert.rejects(move(f.table.id), /free active destination/);
    await assert.rejects(
      f.txA((tx) =>
        tx.tableVisit.update({
          where: { id: visit.id },
          data: { tableId: destination.id, tableCode: destination.code },
        }),
      ),
      /exact latest event/,
    );
    const event = await move(destination.id);
    assert.equal(event.tableId, f.table.id);
    assert.equal(event.targetTableId, destination.id);
    assert.equal(event.previousTableCode, f.table.code);
    const current = await f.txA((tx) =>
      tx.tableVisit.findUniqueOrThrow({ where: { id: visit.id } }),
    );
    assert.equal(current.tableId, destination.id);
    assert.equal(current.billRequested, true);
    assert.equal(current.waiterUserId, visit.waiterUserId);
    assert.equal(current.guestCount, visit.guestCount);
    assert.equal(current.version, 3);
    const oldOrder = await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
    assert.equal(oldOrder.tableVisitId, visit.id);
    assert.equal(oldOrder.tableLabel, f.table.code);
    await f.txA((tx) =>
      tx.order.update({ where: { id: order.id }, data: { notes: 'După mutare', version: 2 } }),
    );
    const nextOrder = await f.txA((tx) => f.linked(tx, visit.id));
    assert.equal(nextOrder.tableLabel, destination.code);
    await f.txA((tx) => f.open(tx, f.table.id));
    await assert.rejects(
      f.txA((tx) => updateTable(tx, destination.id, f.a.user.id, 'ARCHIVE')),
      /open visit/,
    );
    const history = await f.txA((tx) =>
      tx.tableVisitEvent.findMany({
        where: { visitId: visit.id },
        orderBy: { resultVersion: 'asc' },
      }),
    );
    assert.equal((history[0]!.resultSnapshot as { tableId: string }).tableId, f.table.id);
    assert.equal((history[2]!.resultSnapshot as { tableId: string }).tableId, destination.id);
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
