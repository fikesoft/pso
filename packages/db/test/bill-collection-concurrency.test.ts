import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { TenantTransaction } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { writeBillSplit } from './fixtures/bill-split.fixture';
import { responsibilityRace } from './fixtures/responsibility-race.fixture';
test('PostgreSQL: plata întregii părți și retragerea concurează fără efecte duplicate', async (t) => {
  const f = await createOperationsFixture(),
    shift = await openCashShiftFixture(f);
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const mode of ['COLLECT_COLLECT', 'COLLECT_RETIRE', 'RETIRE_COLLECT'] as const) {
        await t.test(`${isolationLevel}: ${mode}`, async () => {
          const { order } = await f.createDraft();
          await f.txA((tx) =>
            tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', version: 2 } }),
          );
          const plan = await f.txA((tx) => writeBillSplit(tx, [order.id], f.a.user.id));
          const identity = {
            organizationId: order.organizationId,
            locationId: order.locationId,
            partId: plan.parts[0]!.id,
            requestKey: randomUUID(),
            actorUserId: f.a.user.id,
          };
          const collect = async (tx: TenantTransaction) => {
            const header = await tx.billCollection.create({
              data: {
                ...identity,
                status: 'SUCCEEDED',
                requestHash: 'a'.repeat(64),
                amount: '3.34',
                method: 'CARD',
                receivedAmount: '3.34',
                cashShiftId: shift.id,
                operationCount: 1,
              },
            });
            await writeFinancialCommand(tx, order.id, {
              cashShiftId: shift.id,
              payments: [{ amount: '3.34', method: 'CARD' }],
              operation: { billPartId: identity.partId, billCollectionId: header.id },
            });
          };
          const retire = (tx: TenantTransaction) =>
            tx.billCollection.create({ data: { ...identity, status: 'RETIRED' } });
          const result = await responsibilityRace({
            organizationId: order.organizationId,
            actor: f.a.user.id,
            isolationLevel,
            snapshot: (tx) => tx.billCollection.count(),
            winner: mode === 'RETIRE_COLLECT' ? retire : collect,
            loser: mode === 'COLLECT_RETIRE' ? retire : collect,
          });
          assert.equal(result.status, 'rejected');
          if (result.status === 'rejected')
            assert.match(
              String(result.reason),
              /entire current outstanding|Unique constraint|serializ|write conflict/i,
            );
          assert.equal(
            await f.txA((tx) =>
              tx.billCollection.count({ where: { requestKey: identity.requestKey } }),
            ),
            1,
          );
          assert.equal(
            await f.txA((tx) => tx.payment.count({ where: { orderId: order.id } })),
            mode === 'RETIRE_COLLECT' ? 0 : 1,
          );
        });
      }
    }
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
