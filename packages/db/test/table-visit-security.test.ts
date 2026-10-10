import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createVisitFixture } from './fixtures/table-visit.fixture';
import { updateTable } from './fixtures/dining-table.fixture';
test('PostgreSQL real: vizite, istoric exact, RLS și legături de comandă', async (t) => {
  const f = await createVisitFixture();
  try {
    const visit = await f.txA((tx) => f.open(tx));
    await t.test(
      'fără context și cu alt tenant vizitele și istoricul sunt invizibile',
      async () => {
        assert.equal(await f.runtime.tableVisit.count(), 0);
        assert.equal(await f.txB((tx) => tx.tableVisit.count()), 0);
        assert.equal(await f.txB((tx) => tx.tableVisitEvent.count()), 0);
        assert.equal(await f.txB((tx) => tx.tableVisitCommand.count()), 0);
        await assert.rejects(f.auth.tableVisit.findMany(), /permission denied/);
        await assert.rejects(f.platform.tableVisitEvent.findMany(), /permission denied/);
        await assert.rejects(
          f.txB((tx) => tx.tableVisit.create({ data: { ...visit, id: randomUUID() } })),
          /row-level|constraint/,
        );
      },
    );
    await t.test(
      'proiecția fără eveniment, mutarea tenantului și ștergerea istoricului sunt refuzate',
      async () => {
        await assert.rejects(
          f.txA((tx) =>
            tx.tableVisit.update({ where: { id: visit.id }, data: { guestCount: 99 } }),
          ),
          /exact latest event/,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.tableVisit.update({
              where: { id: visit.id },
              data: { locationId: f.locationA2.id },
            }),
          ),
          /permission denied/,
        );
        await assert.rejects(
          f.txA((tx) => tx.tableVisit.delete({ where: { id: visit.id } })),
          /permission denied/,
        );
        await assert.rejects(
          f.txA((tx) => tx.tableVisitEvent.deleteMany({ where: { visitId: visit.id } })),
          /permission denied/,
        );
        await assert.rejects(
          f.txA((tx) => tx.tableVisitCommand.updateMany({ data: { status: 'RETIRED' } })),
          /permission denied/,
        );
        await assert.rejects(
          f.txA((tx) => updateTable(tx, f.table.id, f.a.user.id, 'ARCHIVE')),
          /open visit/,
        );
      },
    );
    await t.test(
      'actor străin, claim fără efect și eveniment fără claim nu se confirmă',
      async () => {
        await assert.rejects(
          f.txA((tx) =>
            f.record(tx, visit.id, 'GUEST_COUNT_CHANGED', {
              guestCount: 4,
              actorUserId: f.b.user.id,
            }),
          ),
          /scoped actor/,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.tableVisitEvent.create({
              data: {
                organizationId: f.a.organization.id,
                locationId: f.locationA.id,
                tableId: f.table.id,
                visitId: visit.id,
                requestKey: randomUUID(),
                requestHash: 'a'.repeat(64),
                kind: 'GUEST_COUNT_CHANGED',
                actorUserId: f.a.user.id,
                previousVersion: 1,
                resultVersion: 2,
                guestCount: 9,
              },
            }),
          ),
          /constraint|event or retirement/i,
        );
        assert.equal(
          (await f.txA((tx) => tx.tableVisit.findUniqueOrThrow({ where: { id: visit.id } })))
            .guestCount,
          2,
        );
      },
    );
    await t.test(
      'legătura cu comanda este imuabilă; o ciornă ascunsă împiedică închiderea',
      async () => {
        const order = await f.txA((tx) => f.linked(tx, visit.id));
        await assert.rejects(
          f.txA((tx) =>
            tx.order.update({ where: { id: order.id }, data: { tableVisitId: null, version: 2 } }),
          ),
          /immutable|snapshot/,
        );
        await assert.rejects(
          f.txA((tx) => f.record(tx, visit.id, 'CLOSE')),
          /open orders/,
        );
        const event = await f.txA((tx) => f.record(tx, visit.id, 'BILL_REQUESTED'));
        assert.equal((event.resultSnapshot as { billRequested: boolean }).billRequested, true);
        await assert.rejects(
          f.txA((tx) => f.record(tx, visit.id, 'BILL_REQUESTED')),
          /active request/,
        );
        await f.txA((tx) => f.record(tx, visit.id, 'BILL_CANCELLED'));
        assert.equal(
          (await f.txA((tx) => tx.tableVisit.findUniqueOrThrow({ where: { id: visit.id } })))
            .billRequested,
          false,
        );
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
