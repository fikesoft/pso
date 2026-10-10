import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { TenantTransaction } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { writeBillSplit } from './fixtures/bill-split.fixture';
import { responsibilityRace } from './fixtures/responsibility-race.fixture';
test('PostgreSQL: retragerea tentativei de plan concurează cu crearea/anularea', async (t) => {
  const f = await createOperationsFixture();
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const mode of [
        'CREATE_RETIRE',
        'RETIRE_CREATE',
        'VOID_RETIRE',
        'RETIRE_VOID',
      ] as const) {
        await t.test(`${isolationLevel}: ${mode}`, async () => {
          const { order } = await f.createDraft();
          await f.txA((tx) =>
            tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', version: 2 } }),
          );
          const kind = mode.includes('VOID') ? 'VOID' : 'CREATE';
          const plan =
            kind === 'VOID'
              ? await f.txA((tx) => writeBillSplit(tx, [order.id], f.a.user.id))
              : null;
          const requestKey = randomUUID(),
            identity = {
              organizationId: order.organizationId,
              locationId: order.locationId,
              actorUserId: f.a.user.id,
              requestKey,
            };
          const retire = (tx: TenantTransaction) =>
            tx.billPlanRetirement.create({
              data: {
                ...identity,
                kind,
                targetOrderId: kind === 'CREATE' ? order.id : null,
                targetSplitId: plan?.split.id,
              },
            });
          const execute = (tx: TenantTransaction) =>
            kind === 'CREATE'
              ? writeBillSplit(tx, [order.id], f.a.user.id, undefined, undefined, false, requestKey)
              : tx.billSplitVoid.create({
                  data: {
                    ...identity,
                    splitId: plan!.split.id,
                    reason: 'Anulare concurentă',
                    requestHash: 'a'.repeat(64),
                  },
                });
          const retiredWins = mode.startsWith('RETIRE');
          const result = await responsibilityRace({
            organizationId: order.organizationId,
            actor: f.a.user.id,
            isolationLevel,
            snapshot: (tx) => tx.billPlanRetirement.count(),
            winner: retiredWins ? retire : execute,
            loser: retiredWins ? execute : retire,
          });
          assert.equal(result.status, 'rejected');
          if (result.status === 'rejected')
            assert.match(
              String(result.reason),
              /command retired|cannot be retired|serializ|write conflict/i,
            );
          assert.equal(
            await f.txA((tx) => tx.billPlanRetirement.count({ where: { requestKey } })),
            retiredWins ? 1 : 0,
          );
          const count = await f.txA((tx) =>
            kind === 'CREATE'
              ? tx.billSplit.count({ where: { requestKey } })
              : tx.billSplitVoid.count({ where: { requestKey } }),
          );
          assert.equal(count, retiredWins ? 0 : 1);
        });
      }
    }
    assert.equal(await f.runtime.billPlanRetirement.count(), 0);
    assert.equal(await f.txB((tx) => tx.billPlanRetirement.count()), 0);
    await assert.rejects(f.platform.billPlanRetirement.findMany(), /permission denied/);
    await assert.rejects(
      f.txA((tx) => tx.billPlanRetirement.deleteMany()),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) => tx.billPlanRetirement.updateMany({ data: { actorUserId: f.b.user.id } })),
      /permission denied/,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
