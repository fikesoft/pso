import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createCashRegisterFixture } from './fixtures/cash-register.fixture';
import { openCashShiftFixture, closeCashShiftFixture } from './fixtures/cash-shift.fixture';
import { writeCashMovement } from './fixtures/cash-movement.fixture';
import { readShiftSummary, closingResponse } from '../../../apps/api/src/entities/cash-shift';

test('PostgreSQL real: numerar IN/OUT, surse imuabile și closingV2', async (t) => {
  const f = await createCashRegisterFixture();
  try {
    const shift = await openCashShiftFixture(f, 'a', f.locationA.id, '7');
    const run = (direction: 'IN' | 'OUT', amount: string) =>
      f.txA((tx) => writeCashMovement(tx, shift.id, direction, amount));
    await t.test('IN20 OUT7 IN2 OUT1 păstrează suma, restul componentelor și bumps', async () => {
      await run('IN', '20');
      await run('OUT', '7');
      await run('IN', '2');
      await run('OUT', '1');
      const summary = await f.txA((tx) => readShiftSummary(tx, f.a.organization.id, shift.id));
      assert.equal(summary.expectedCash, '21.00');
      assert.equal(summary.cashIn, '22.00');
      assert.equal(summary.cashOut, '8.00');
      assert.equal(summary.cashCollected, '0.00');
      assert.equal(summary.cardNet, '0.00');
      assert.equal(summary.paidOrderCount, 0);
      assert.equal(
        (await f.txA((tx) => tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } }))).version,
        5,
      );
    });
    await t.test(
      'insuficiență/stale/valori nevalide fac rollback fără surse parțiale',
      async () => {
        const count = () => f.txA((tx) => tx.cashOperation.count({ where: { shiftId: shift.id } }));
        const before = await count();
        await assert.rejects(run('OUT', '100'), /exceeds available cash/);
        await assert.rejects(
          f.txA((tx) => writeCashMovement(tx, shift.id, 'IN', '1', { expectedVersion: 1 })),
          /own open shift and current version/,
        );
        for (const amount of ['0', '-1', 'NaN', 'Infinity']) {
          await assert.rejects(
            f.txA(
              (tx) => tx.$executeRaw`INSERT INTO "CashOperation"
          (id,"organizationId","locationId","registerId","shiftId",kind,"requestKey","requestHash","actorUserId","expectedVersion","cashShiftVersion",amount,reason)
          VALUES(${randomUUID()}::uuid,${shift.organizationId}::uuid,${shift.locationId}::uuid,${shift.registerId}::uuid,${shift.id}::uuid,'CASH_IN',${randomUUID()}::uuid,${'d'.repeat(64)},${f.a.user.id}::uuid,5,6,${amount}::numeric,'Probă numerică')`,
            ),
            /constraint|overflow|numeric field/i,
          );
        }
        assert.equal(await count(), before);
        assert.equal(
          await f.txA((tx) => tx.cashMovement.count({ where: { shiftId: shift.id } })),
          5,
        );
      },
    );
    await t.test('owner și context nu se confundă cu autoritatea managerială', async () => {
      const other = await f.txA((tx) =>
        tx.companyUser.create({
          data: {
            organizationId: f.a.organization.id,
            displayName: 'Alt operator sintetic',
            createdByUserId: f.a.user.id,
            passwordHash: '$argon2id$test-fixture-not-a-login-hash',
            loginNormalized: `other-${randomUUID()}`,
            status: 'ACTIVE',
          },
        }),
      );
      await f.txA((tx) =>
        tx.userLocationAccess.create({
          data: {
            organizationId: f.a.organization.id,
            locationId: f.locationA.id,
            userId: other.id,
          },
        }),
      );
      await assert.rejects(
        f.txA(async (tx) => {
          await tx.$queryRaw`SELECT set_config('app.user_id',${other.id},true)`;
          await writeCashMovement(tx, shift.id, 'OUT', '1', { actor: other.id });
        }),
        /own open shift and current version/,
      );
      await assert.rejects(
        f.txB((tx) => writeCashMovement(tx, shift.id, 'IN', '1')),
        /No record was found|not found/i,
      );
    });
    await t.test(
      'movement fals, key duplicată și UPDATE/DELETE nu pot altera ledgerul',
      async () => {
        const source = await f.txA((tx) =>
          tx.cashMovement.findFirstOrThrow({ where: { shiftId: shift.id, kind: 'CASH_IN' } }),
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.cashMovement.create({ data: { ...source, id: randomUUID(), amount: '999' } }),
          ),
          /exactly match its real cash source/,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.cashOperation.update({
              where: { id: source.cashOperationId! },
              data: { amount: '999' },
            }),
          ),
          /permission denied/,
        );
        const original = await f.txA((tx) =>
          tx.cashOperation.findUniqueOrThrow({ where: { id: source.cashOperationId! } }),
        );
        await assert.rejects(
          f.txA((tx) =>
            writeCashMovement(tx, shift.id, 'IN', '20', { requestKey: original.requestKey }),
          ),
          /Unique constraint/,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.cashCommandClaim.deleteMany({ where: { cashOperationId: original.id } }),
          ),
          /permission denied/,
        );
      },
    );
    await t.test('CLOSE V2 fixează cashIn/out și refuză operații ulterioare', async () => {
      const closing = await f.txA((tx) => closeCashShiftFixture(tx, shift.id, '21'));
      assert.equal(closing.cashIn!.toFixed(2), '22.00');
      assert.equal(closing.cashOut!.toFixed(2), '8.00');
      assert.equal(closingResponse(closing).difference, '0.00');
      assert.ok('cashIn' in closingResponse(closing).summary);
      await assert.rejects(run('IN', '1'), /open scoped shift/);
    });
    await t.test('totalurile derivate IN/OUT sunt numeric fără limită de agregare', async () => {
      const large = await openCashShiftFixture(f, 'a', f.locationA.id, '0');
      await f.txA((tx) => writeCashMovement(tx, large.id, 'IN', '9999999999999999.99'));
      await f.txA((tx) => writeCashMovement(tx, large.id, 'IN', '1'));
      const closing = await f.txA((tx) => closeCashShiftFixture(tx, large.id, '0'));
      assert.equal(closing.cashIn!.toFixed(2), '10000000000000000.99');
      assert.equal(closing.expectedCash.toFixed(2), '10000000000000000.99');
    });
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
