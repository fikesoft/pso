import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  createResponsibilityFixture,
  writeResponsibility,
} from './fixtures/order-responsibility.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';

test('PostgreSQL real: responsabilitate RLS, ACL, claims și snapshoturi exacte', async (t) => {
  const f = await createResponsibilityFixture();
  try {
    const order = await f.confirmed();
    const command = await f.txA((tx) =>
      writeResponsibility(tx, order.id, { kind: 'ASSIGN', targetShiftId: f.shift.id }),
    );
    await t.test('context absent/B nu citesc cele patru tabele și nu pot modifica A', async () => {
      for (const table of [
        'OrderResponsibility',
        'OrderResponsibilityEvent',
        'OrderResponsibilityCommand',
        'OrderResponsibilityGate',
      ]) {
        const none = await f.runtime.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${table}"`);
        assert.equal(none.length, 0);
        const foreign = await f.txB((tx) =>
          tx.$queryRawUnsafe<unknown[]>(
            `SELECT * FROM "${table}" WHERE "organizationId"=$1::uuid`,
            f.a.organization.id,
          ),
        );
        assert.equal(foreign.length, 0);
      }
      const before = await f.txA((tx) =>
        tx.orderResponsibility.findFirstOrThrow({ where: { orderId: order.id } }),
      );
      assert.deepEqual(
        await f.txB((tx) =>
          tx.orderResponsibility.updateMany({
            where: { orderId: order.id },
            data: { state: 'RESOLVED' },
          }),
        ),
        { count: 0 },
      );
      assert.deepEqual(
        await f.txA((tx) =>
          tx.orderResponsibility.findFirstOrThrow({ where: { orderId: order.id } }),
        ),
        before,
      );
    });
    await t.test('event și command nu au UPDATE/DELETE; projection/gate nu au DELETE', async () => {
      for (const table of ['OrderResponsibilityEvent', 'OrderResponsibilityCommand']) {
        await assert.rejects(
          f.txA((tx) => tx.$executeRawUnsafe(`UPDATE "${table}" SET "actorUserId"="actorUserId"`)),
          /permission denied/,
        );
      }
      for (const table of [
        'OrderResponsibilityEvent',
        'OrderResponsibilityCommand',
        'OrderResponsibility',
        'OrderResponsibilityGate',
      ])
        await assert.rejects(
          f.txA((tx) => tx.$executeRawUnsafe(`DELETE FROM "${table}"`)),
          /permission denied/,
        );
      await assert.rejects(
        f.txA((tx) =>
          tx.orderResponsibility.updateMany({
            where: { orderId: order.id },
            data: { state: 'RESOLVED' },
          }),
        ),
        /exact event snapshot/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.orderResponsibilityGate.updateMany({
            where: { orderId: order.id },
            data: { revision: 999 },
          }),
        ),
        /identity and revision/,
      );
    });
    await t.test('ghost command și perechi incomplete nu pot comite', async () => {
      for (const omit of ['event', 'command'] as const) {
        const fresh = await f.confirmed();
        await assert.rejects(
          f.txA((tx) =>
            writeResponsibility(tx, fresh.id, { kind: 'ASSIGN', targetShiftId: f.shift.id, omit }),
          ),
          /exact immutable effect identity|Foreign key constraint|ForeignKeyConstraintViolation/,
        );
        assert.equal(
          await f.txA((tx) => tx.orderResponsibility.count({ where: { orderId: fresh.id } })),
          0,
        );
      }
      const stored = await f.txA((tx) =>
        tx.orderResponsibilityCommand.findFirstOrThrow({
          where: { requestKey: command.requestKey },
        }),
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.orderResponsibilityCommand.create({
            data: { ...stored, id: randomUUID(), requestKey: randomUUID() },
          }),
        ),
        /Unique constraint|exact immutable effect identity/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.orderResponsibilityCommand.create({
            data: {
              organizationId: f.a.organization.id,
              locationId: f.locationA.id,
              orderId: order.id,
              requestKey: command.requestKey,
              actorUserId: f.a.user.id,
              kind: 'ASSIGN',
              targetShiftId: f.shift.id,
              status: 'RETIRED',
            },
          }),
        ),
        /cannot retire an existing responsibility effect/,
      );
    });
    await t.test('scope FK nu permite tură din B, ordine sau actor nepotrivit', async () => {
      const foreignShift = await openCashShiftFixture(f, 'b');
      const fresh = await f.confirmed();
      await assert.rejects(
        f.txA((tx) =>
          writeResponsibility(tx, fresh.id, { kind: 'ASSIGN', targetShiftId: foreignShift.id }),
        ),
        /shift scope mismatch/,
      );
      await assert.rejects(
        f.txA((tx) =>
          writeResponsibility(tx, fresh.id, {
            kind: 'ASSIGN',
            targetShiftId: f.shift.id,
            actor: f.b.user.id,
          }),
        ),
        /current scoped actor/,
      );
      await assert.rejects(
        f.txA((tx) =>
          writeResponsibility(tx, order.id, {
            kind: 'PREPARE_HANDOFF',
            sourceShiftId: f.shift.id,
            previousVersion: 0,
          }),
        ),
        /current order and responsibility versions/,
      );
    });
    await t.test('rezolvare falsă fără sursă reală nu schimbă proiecția', async () => {
      await assert.rejects(
        f.txA((tx) =>
          tx.orderResponsibilityEvent.create({
            data: {
              organizationId: f.a.organization.id,
              locationId: f.locationA.id,
              orderId: order.id,
              version: 2,
              previousVersion: 1,
              kind: 'RESOLVED_PAID',
              actorUserId: f.a.user.id,
              orderVersion: order.version,
              sourceOrderEventId: randomUUID(),
            },
          }),
        ),
        /exact current commercial source/,
      );
      const p = await f.txA((tx) =>
        tx.orderResponsibility.findFirstOrThrow({ where: { orderId: order.id } }),
      );
      assert.equal(p.state, 'ASSIGNED');
      assert.equal(p.version, 1);
    });
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
