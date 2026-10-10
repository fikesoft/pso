import { readShiftSummary } from '../../../apps/api/src/entities/cash-shift';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  createResponsibilityFixture,
  writeResponsibility,
} from './fixtures/order-responsibility.fixture';
import { closeCashShiftFixture, openRegisterShiftFixture } from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { updateRegister } from './fixtures/cash-register.fixture';
import { prepareResponsibility } from '../../../apps/api/src/entities/order-responsibility';

test('PostgreSQL real: asumare, predare, surse financiare și istoric fără backfill', async (t) => {
  const f = await createResponsibilityFixture();
  try {
    const order = await f.confirmed();
    const original = await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
    await t.test('helper Prisma void cast și două evenimente în aceeași tranzacție', async () => {
      await f.txA(async (tx) => {
        await prepareResponsibility(tx, f.a.organization.id, f.locationA.id, order.id, [
          f.shift.id,
        ]);
        await writeResponsibility(tx, order.id, {
          kind: 'ASSIGN',
          targetShiftId: f.shift.id,
          commandFirst: true,
        });
        await writeResponsibility(tx, order.id, {
          kind: 'PREPARE_HANDOFF',
          sourceShiftId: f.shift.id,
        });
      });
      const p = await f.txA((tx) =>
        tx.orderResponsibility.findFirstOrThrow({ where: { orderId: order.id } }),
      );
      assert.equal(p.state, 'PENDING_HANDOFF');
      assert.equal(p.version, 2);
      assert.equal(p.ownerUserId, f.a.user.id);
      assert.deepEqual(
        await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } })),
        original,
      );
    });
    await t.test(
      'pending permite CLOSE, blochează archive, ACCEPT cere sursă închisă',
      async () => {
        await assert.rejects(
          f.txA((tx) =>
            writeResponsibility(tx, order.id, {
              kind: 'ACCEPT_HANDOFF',
              targetShiftId: f.shift.id,
              handoffEventId: randomUUID(),
            }),
          ),
          /exact pending handoff/,
        );
        await f.txA((tx) => closeCashShiftFixture(tx, f.shift.id, '20'));
        await assert.rejects(
          f.txA((tx) => updateRegister(tx, f.shift.registerId, f.a.user.id, 'ARCHIVE')),
          /pending handoff/,
        );
        const next = await f.txA((tx) =>
          openRegisterShiftFixture(tx, f.shift.registerId, f.a.user.id, '20'),
        );
        const pending = await f.txA((tx) =>
          tx.orderResponsibility.findFirstOrThrow({ where: { orderId: order.id } }),
        );
        await f.txA((tx) =>
          writeResponsibility(tx, order.id, {
            kind: 'ACCEPT_HANDOFF',
            targetShiftId: next.id,
            handoffEventId: pending.pendingEventId!,
          }),
        );
        await assert.rejects(
          f.txA((tx) => closeCashShiftFixture(tx, next.id, '20')),
          /unresolved assigned orders/,
        );
        const paid = await f.txA((tx) =>
          writeFinancialCommand(tx, order.id, {
            cashShiftId: next.id,
            payments: [{ amount: '10.01' }],
          }),
        );
        let p = await f.txA((tx) =>
          tx.orderResponsibility.findFirstOrThrow({ where: { orderId: order.id } }),
        );
        assert.equal(p.state, 'RESOLVED');
        assert.equal(p.version, 4);
        assert.equal(p.ownerUserId, null);
        const event = await f.txA((tx) =>
          tx.orderResponsibilityEvent.findUniqueOrThrow({ where: { id: p.lastEventId } }),
        );
        assert.equal(event.kind, 'RESOLVED_PAID');
        assert.equal(event.paymentOperationId, paid.operation.id);
        assert.equal(event.sourceShiftId, next.id);
        await f.txA((tx) =>
          writeFinancialCommand(tx, order.id, {
            cashShiftId: next.id,
            refunds: [{ paymentId: paid.payments[0]!.id, amount: '1' }],
          }),
        );
        p = await f.txA((tx) =>
          tx.orderResponsibility.findFirstOrThrow({ where: { orderId: order.id } }),
        );
        assert.equal(p.state, 'UNASSIGNED');
        assert.equal(p.version, 5);
        assert.equal(p.shiftId, null);
        assert.equal(
          (await f.txA((tx) => tx.cashShift.findUniqueOrThrow({ where: { id: f.shift.id } })))
            .status,
          'CLOSED',
        );
        assert.equal(
          await f.txA((tx) =>
            tx.orderResponsibilityCommand.count({ where: { orderId: order.id } }),
          ),
          3,
        );
      },
    );
    await t.test(
      'unassigned confirmed orders do not block closing and remain without inferred owner',
      async () => {
        const fresh = await f.confirmed();
        const open = await f.txA((tx) =>
          tx.cashShift.findFirstOrThrow({
            where: { registerId: f.shift.registerId, status: 'OPEN' },
          }),
        );
        const summary = await f.txA((tx) => readShiftSummary(tx, f.a.organization.id, open.id));
        await f.txA((tx) => closeCashShiftFixture(tx, open.id, summary.expectedCash));

        assert.equal(
          await f.txA((tx) => tx.orderResponsibility.count({ where: { orderId: fresh.id } })),
          0,
        );
      },
    );
    await t.test(
      'incoming neacceptat nu blochează tura nouă și nu mută ownerul outgoing',
      async () => {
        const fresh = await f.confirmed();
        const source = await f.txA((tx) =>
          openRegisterShiftFixture(tx, f.shift.registerId, f.a.user.id, '20'),
        );
        await f.txA((tx) =>
          writeResponsibility(tx, fresh.id, { kind: 'ASSIGN', targetShiftId: source.id }),
        );
        await f.txA((tx) =>
          writeResponsibility(tx, fresh.id, { kind: 'PREPARE_HANDOFF', sourceShiftId: source.id }),
        );
        await f.txA((tx) => closeCashShiftFixture(tx, source.id, '20'));
        const incoming = await f.txA((tx) =>
          openRegisterShiftFixture(tx, source.registerId, f.a.user.id, '20'),
        );
        await f.txA((tx) => closeCashShiftFixture(tx, incoming.id, '20'));
        const p = await f.txA((tx) =>
          tx.orderResponsibility.findFirstOrThrow({ where: { orderId: fresh.id } }),
        );
        assert.equal(p.state, 'PENDING_HANDOFF');
        assert.equal(p.shiftId, source.id);
        await assert.rejects(
          f.txA((tx) => updateRegister(tx, source.registerId, f.a.user.id, 'ARCHIVE')),
          /pending handoff/,
        );
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
