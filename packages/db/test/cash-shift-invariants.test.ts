import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';

test('PostgreSQL real: surse exacte și frontieră deferred a turei', async (t) => {
  const f = await createOperationsFixture();
  try {
    const shift = await openCashShiftFixture(f);
    const draft = await f.createDraft();
    await f.txA((tx) =>
      tx.order.update({
        where: { id: draft.order.id },
        data: { status: 'CONFIRMED', version: { increment: 1 } },
      }),
    );
    const command = { cashShiftId: shift.id, payments: [{ amount: '1' }] };
    await t.test('header real fără tură și mutație fără activity sunt refuzate', async () => {
      await assert.rejects(
        f.txA((tx) =>
          writeFinancialCommand(tx, draft.order.id, {
            ...command,
            operation: { cashShiftId: null },
          }),
        ),
        /open scoped shift/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.cashShift.update({
            where: { id: shift.id },
            data: {
              version: { increment: 1 },
              lastActivityId: randomUUID(),
            },
          }),
        ),
        /exact activity/,
      );
    });
    await t.test('două modificări deferred incompatibile se anulează integral', async () => {
      const second = await f.createDraft();
      await f.txA((tx) =>
        tx.order.update({
          where: { id: second.order.id },
          data: { status: 'CONFIRMED', version: { increment: 1 } },
        }),
      );
      await assert.rejects(
        f.txA(async (tx) => {
          await writeFinancialCommand(tx, draft.order.id, command);
          await writeFinancialCommand(tx, second.order.id, command);
        }),
        /shift version, exact complete ledger|exact shift mutation|current scoped order version/,
      );
      assert.equal(
        await f.txA((tx) => tx.paymentOperation.count({ where: { cashShiftId: shift.id } })),
        0,
      );
      assert.equal(
        (await f.txA((tx) => tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } }))).version,
        1,
      );
    });
    await t.test(
      'frontiera explicită IMMEDIATE apoi DEFERRED permite perechi complete',
      async () => {
        await f.txA(async (tx) => {
          await writeFinancialCommand(tx, draft.order.id, command);
          await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
          await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
          await writeFinancialCommand(tx, draft.order.id, command);
        });
        assert.equal(
          (await f.txA((tx) => tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } })))
            .version,
          3,
        );
      },
    );
    await t.test('ledger/activity/claim fantomă nu pot reutiliza sursa veche', async () => {
      const rows = await f.txA(async (tx) => ({
        movement: await tx.cashMovement.findFirstOrThrow({
          where: { shiftId: shift.id, kind: 'OPENING' },
        }),
        activity: await tx.cashShiftActivity.findFirstOrThrow({
          where: { shiftId: shift.id, kind: 'OPEN' },
        }),
        claim: await tx.cashCommandClaim.findFirstOrThrow({
          where: { registerId: shift.registerId, kind: 'OPEN' },
        }),
      }));
      await assert.rejects(
        f.txA((tx) =>
          tx.cashMovement.create({ data: { ...rows.movement, id: randomUUID(), amount: '999' } }),
        ),
        /exactly match its real cash source/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.cashShiftActivity.create({
            data: { ...rows.activity, id: randomUUID(), shiftVersion: 4 },
          }),
        ),
        /match its header and next shift version/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.cashCommandClaim.create({
            data: { ...rows.claim, id: randomUUID(), requestKey: randomUUID() },
          }),
        ),
        /exact new source identity/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.cashRegisterGate.updateMany({
            where: { registerId: shift.registerId },
            data: { locationId: f.locationA2.id },
          }),
        ),
        /permission denied/,
      );
    });
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
