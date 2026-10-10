import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { openCashShiftFixture, closeCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { updateRegister } from './fixtures/cash-register.fixture';

test('PostgreSQL real: ture, registru exact și închidere imuabilă', async (t) => {
  const f = await createOperationsFixture();
  try {
    const shift = await openCashShiftFixture(f);
    const draft = await f.createDraft();
    await f.txA((tx) =>
      tx.order.update({
        where: { id: draft.order.id },
        data: {
          status: 'CONFIRMED',
          version: { increment: 1 },
        },
      }),
    );
    const post = (payments: Array<{ amount: string; method?: 'CASH' | 'CARD' }>) =>
      f.txA((tx) => writeFinancialCommand(tx, draft.order.id, { cashShiftId: shift.id, payments }));
    await t.test('OPEN are un singur fond, activity, claim; arhivarea este blocată', async () => {
      const rows = await f.txA(async (tx) => ({
        moves: await tx.cashMovement.findMany({ where: { shiftId: shift.id } }),
        activities: await tx.cashShiftActivity.count({ where: { shiftId: shift.id } }),
        gates: await tx.cashRegisterGate.findMany({ where: { registerId: shift.registerId } }),
      }));
      assert.equal(rows.moves.length, 1);
      assert.equal(rows.moves[0]!.amount.toFixed(2), '1000.00');
      assert.equal(rows.activities, 1);
      assert.equal(rows.gates.length, 1);
      await assert.rejects(
        f.txA((tx) => updateRegister(tx, shift.registerId, f.a.user.id, 'ARCHIVE')),
        /register has an open shift/,
      );
    });
    await t.test('split numerar/card schimbă versiunea o singură dată', async () => {
      await post([{ amount: '2' }, { amount: '3', method: 'CARD' }]);
      const row = await f.txA((tx) => tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } }));
      assert.equal(row.version, 2);
      assert.equal(await f.txA((tx) => tx.cashMovement.count({ where: { shiftId: shift.id } })), 2);
    });
    await t.test(
      'CLOSE fixează suma, diferența și snapshotul; turele închise refuză scrieri',
      async () => {
        const closing = await f.txA((tx) => closeCashShiftFixture(tx, shift.id, '1001'));
        assert.equal(closing.expectedCash.toFixed(2), '1002.00');
        assert.equal(closing.difference.toFixed(2), '-1.00');
        assert.equal(closing.cashCollected.toFixed(2), '2.00');
        assert.equal(closing.cardCollected.toFixed(2), '3.00');
        await assert.rejects(post([{ amount: '1' }]), /open scoped shift/);
        await assert.rejects(
          f.txA((tx) =>
            tx.cashClosing.update({ where: { id: closing.id }, data: { countedCash: '0' } }),
          ),
          /permission denied/,
        );
        await assert.rejects(
          f.txA((tx) => tx.cashShift.delete({ where: { id: shift.id } })),
          /permission denied/,
        );
        await f.txA((tx) => updateRegister(tx, shift.registerId, f.a.user.id, 'ARCHIVE'));
      },
    );
    await t.test(
      'totalul derivat poate depăși numeric(18,2) fără blocarea închiderii',
      async () => {
        const large = await openCashShiftFixture(f, 'a', f.locationA.id, '9999999999999999.99');
        await f.txA((tx) =>
          writeFinancialCommand(tx, draft.order.id, {
            cashShiftId: large.id,
            payments: [{ amount: '1' }],
          }),
        );
        const closing = await f.txA((tx) => closeCashShiftFixture(tx, large.id, '0'));
        assert.equal(closing.expectedCash.toFixed(2), '10000000000000000.99');
        assert.equal(closing.difference.toFixed(2), '-10000000000000000.99');
      },
    );
    await t.test('RLS FORCE, tenant și ACL pentru gate și istoric', async () => {
      assert.equal(await f.txB((tx) => tx.cashShift.count({ where: { id: shift.id } })), 0);
      const security = await f.runtime.$queryRaw<
        Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
      >`
        SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN
        ('CashRegisterGate','CashShift','CashOperation','CashShiftActivity','CashCommandClaim','CashMovement','CashClosing')`;
      assert.equal(security.length, 7);
      assert.ok(security.every((row) => row.relrowsecurity && row.relforcerowsecurity));
      await assert.rejects(
        f.txA((tx) => tx.cashRegisterGate.deleteMany({ where: { registerId: shift.registerId } })),
        /permission denied/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.cashRegisterGate.updateMany({
            where: { registerId: shift.registerId },
            data: { revision: 0 },
          }),
        ),
        /identity and generation are protected/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.cashRegisterGate.create({
            data: {
              organizationId: f.a.organization.id,
              locationId: f.locationA.id,
              registerId: randomUUID(),
              revision: 1,
            },
          }),
        ),
        /Foreign key constraint|foreign key constraint/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.cashCommandClaim.create({
            data: {
              organizationId: f.a.organization.id,
              locationId: f.locationA.id,
              family: 'CASH',
              kind: 'CLOSE',
              requestKey: randomUUID(),
              actorUserId: f.a.user.id,
              shiftId: shift.id,
              status: 'SUCCEEDED',
              requestHash: 'c'.repeat(64),
              cashOperationId: randomUUID(),
            },
          }),
        ),
        /exact new source identity/,
      );
      await assert.rejects(
        f.txA((tx) => tx.cashMovement.deleteMany({ where: { shiftId: shift.id } })),
        /permission denied/,
      );
    });
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
