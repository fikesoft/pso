import assert from 'node:assert/strict';
import { test } from 'node:test';
import { responsibilityRace } from './fixtures/responsibility-race.fixture';
import {
  createKitchenBatchesFixture,
  advanceKitchenBatch,
} from './fixtures/kitchen-batches.fixture';
test('PostgreSQL: finalizările concurente ale stațiilor nu pierd progresul agregat', async (t) => {
  for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
    await t.test(isolationLevel, async () => {
      const f = await createKitchenBatchesFixture();
      try {
        await f.txA((tx) => advanceKitchenBatch(tx, f.assigned.id, f.a.user.id, 'PREPARING'));
        await f.txA((tx) => advanceKitchenBatch(tx, f.unassigned.id, f.a.user.id, 'PREPARING'));
        const result = await responsibilityRace({
          organizationId: f.a.organization.id,
          actor: f.a.user.id,
          isolationLevel,
          snapshot: (tx) => tx.kitchenTicketBatch.count(),
          winner: (tx) => advanceKitchenBatch(tx, f.assigned.id, f.a.user.id, 'READY'),
          loser: (tx) => advanceKitchenBatch(tx, f.unassigned.id, f.a.user.id, 'READY'),
        });
        if (isolationLevel === 'RepeatableRead') {
          assert.equal(result.status, 'rejected');
          if (result.status === 'rejected')
            assert.match(String(result.reason), /serializ|write conflict/i);
          await f.txA((tx) => advanceKitchenBatch(tx, f.unassigned.id, f.a.user.id, 'READY'));
        } else assert.equal(result.status, 'fulfilled');
        const ticket = await f.txA((tx) =>
          tx.kitchenTicket.findUniqueOrThrow({ where: { id: f.ticket.id } }),
        );
        const order = await f.txA((tx) =>
          tx.order.findUniqueOrThrow({ where: { id: f.ticket.orderId } }),
        );
        const batches = await f.txA((tx) =>
          tx.kitchenTicketBatch.findMany({ where: { ticketId: ticket.id } }),
        );
        assert.equal(ticket.status, 'READY');
        assert.equal(order.status, 'IN_PROGRESS');
        assert.equal(order.kitchenStatus, 'READY');
        assert.equal((await f.txA((tx) => tx.packingSession.findFirstOrThrow())).status, 'WAITING');
        assert.ok(batches.every((batch) => batch.status === 'READY' && batch.version === 3));
      } finally {
        await Promise.all([
          f.runtime.$disconnect(),
          f.platform.$disconnect(),
          f.auth.$disconnect(),
        ]);
      }
    });
  }
});
