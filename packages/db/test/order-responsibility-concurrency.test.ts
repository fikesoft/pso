import { cancelResponsibilityOrder } from './fixtures/responsibility-cancel.fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { TenantTransaction } from '../src';
import {
  createResponsibilityFixture,
  writeResponsibility,
} from './fixtures/order-responsibility.fixture';
import {
  openCashShiftFixture,
  closeCashShiftFixture,
  openRegisterShiftFixture,
} from './fixtures/cash-shift.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';
import { responsibilityRace } from './fixtures/responsibility-race.fixture';
import { cashConflict } from './fixtures/cash-conflict.fixture';

test('PostgreSQL real: lockuri observate responsabilitate RC/RR și claim-first/event-first', async (t) => {
  const f = await createResponsibilityFixture();
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const)
      for (const scenario of [
        'ASSIGN_CLOSE',
        'CLOSE_ASSIGN',
        'ASSIGN_PAID',
        'PAID_ASSIGN',
        'PREPARE_CLOSE',
        'ACCEPT_ACCEPT',
        'COMMAND_EVENT',
        'EVENT_COMMAND',
        'RETIRE_ASSIGN',
        'ASSIGN_RETIRE',
        'ASSIGN_CANCEL',
        'CANCEL_ASSIGN',
        'PREPARE_REFUND',
        'REFUND_PREPARE',
      ] as const)
        await t.test(`${isolationLevel}: ${scenario}`, async () => {
          const order = await f.confirmed();
          let shift = await openCashShiftFixture(f, 'a', f.locationA.id, '20');
          let pendingEventId: string | null = null;
          if (
            scenario === 'PREPARE_CLOSE' ||
            scenario === 'ACCEPT_ACCEPT' ||
            scenario.includes('REFUND')
          ) {
            await f.txA((tx) =>
              writeResponsibility(tx, order.id, { kind: 'ASSIGN', targetShiftId: shift.id }),
            );
            if (scenario === 'ACCEPT_ACCEPT') {
              const pending = await f.txA((tx) =>
                writeResponsibility(tx, order.id, {
                  kind: 'PREPARE_HANDOFF',
                  sourceShiftId: shift.id,
                }),
              );
              pendingEventId = pending.id;
              await f.txA((tx) => closeCashShiftFixture(tx, shift.id, '20'));
              shift = await f.txA((tx) =>
                openRegisterShiftFixture(tx, shift.registerId, f.a.user.id, '20'),
              );
            }
          }
          const paid = scenario.includes('REFUND')
            ? await f.txA((tx) =>
                writeFinancialCommand(tx, order.id, {
                  cashShiftId: shift.id,
                  payments: [{ amount: '1' }],
                }),
              )
            : null;
          const key = randomUUID();
          const act = async (tx: TenantTransaction, action: string) => {
            if (action === 'CANCEL') return cancelResponsibilityOrder(tx, order.id);
            if (action === 'REFUND')
              return writeFinancialCommand(tx, order.id, {
                cashShiftId: shift.id,
                refunds: [{ paymentId: paid!.payments[0]!.id, amount: '1' }],
              });
            if (action === 'CLOSE') return closeCashShiftFixture(tx, shift.id, '20');
            if (action === 'PAID')
              return writeFinancialCommand(tx, order.id, {
                cashShiftId: shift.id,
                payments: [{ amount: '10.01' }],
              });
            if (action === 'PREPARE')
              return writeResponsibility(tx, order.id, {
                kind: 'PREPARE_HANDOFF',
                sourceShiftId: shift.id,
                previousVersion: 1,
              });
            if (action === 'ACCEPT')
              return writeResponsibility(tx, order.id, {
                kind: 'ACCEPT_HANDOFF',
                targetShiftId: shift.id,
                handoffEventId: pendingEventId!,
                previousVersion: 2,
              });
            if (action === 'RETIRE')
              return tx.orderResponsibilityCommand.create({
                data: {
                  organizationId: f.a.organization.id,
                  locationId: f.locationA.id,
                  orderId: order.id,
                  requestKey: key,
                  actorUserId: f.a.user.id,
                  kind: 'ASSIGN',
                  targetShiftId: shift.id,
                  status: 'RETIRED',
                },
              });
            return writeResponsibility(tx, order.id, {
              kind: 'ASSIGN',
              targetShiftId: shift.id,
              previousVersion: 0,
              requestKey: scenario.includes('RETIRE') ? key : randomUUID(),
              commandFirst: action === 'COMMAND',
            });
          };
          const [first, second] = scenario.split('_');
          const result = await responsibilityRace({
            organizationId: f.a.organization.id,
            actor: f.a.user.id,
            isolationLevel,
            snapshot: (tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }),
            winner: (tx) => act(tx, first!),
            loser: (tx) => act(tx, second!),
          });
          const successAllowed =
            isolationLevel === 'ReadCommitted' &&
            (scenario === 'ASSIGN_PAID' ||
              scenario === 'PREPARE_CLOSE' ||
              scenario === 'ASSIGN_CANCEL' ||
              scenario === 'PREPARE_REFUND');
          if (successAllowed) assert.equal(result.status, 'fulfilled');
          else {
            assert.equal(result.status, 'rejected');
            if (result.status === 'rejected')
              assert.ok(
                cashConflict(
                  result.reason,
                  /unresolved assigned orders|own open shift|not eligible|current order and responsibility versions|Unique constraint|exact immutable effect identity|cannot retire an existing responsibility effect/,
                ),
                String(result.reason),
              );
          }
          const count = await f.txA((tx) =>
            tx.orderResponsibilityEvent.count({ where: { orderId: order.id } }),
          );
          const p = await f.txA((tx) =>
            tx.orderResponsibility.findFirst({ where: { orderId: order.id } }),
          );
          const expected =
            scenario === 'ACCEPT_ACCEPT'
              ? 3
              : scenario === 'PREPARE_CLOSE' || scenario === 'PREPARE_REFUND'
                ? 2
                : scenario === 'CLOSE_ASSIGN' ||
                    scenario === 'PAID_ASSIGN' ||
                    scenario === 'RETIRE_ASSIGN' ||
                    scenario === 'CANCEL_ASSIGN'
                  ? 0
                  : (scenario === 'ASSIGN_PAID' || scenario === 'ASSIGN_CANCEL') && successAllowed
                    ? 2
                    : 1;
          assert.equal(count, expected);
          assert.equal(p?.version ?? 0, expected);
          assert.equal(
            await f.txA((tx) =>
              tx.orderResponsibilityCommand.count({ where: { orderId: order.id } }),
            ),
            scenario === 'ACCEPT_ACCEPT'
              ? 3
              : scenario === 'PREPARE_CLOSE' || scenario === 'PREPARE_REFUND'
                ? 2
                : scenario === 'CLOSE_ASSIGN' ||
                    scenario === 'PAID_ASSIGN' ||
                    scenario === 'CANCEL_ASSIGN'
                  ? 0
                  : 1,
          );
          if ((scenario === 'ASSIGN_PAID' || scenario === 'ASSIGN_CANCEL') && successAllowed)
            assert.equal(p?.state, 'RESOLVED');
        });
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const)
      await t.test(
        `${isolationLevel}: două comenzi nominalA/payoutB și nominalB/payoutA`,
        async () => {
          const a = await f.confirmed(),
            b = await f.confirmed();
          const shiftA = await openCashShiftFixture(f, 'a', f.locationA.id, '20'),
            shiftB = await openCashShiftFixture(f, 'a', f.locationA.id, '20');
          await f.txA((tx) =>
            writeResponsibility(tx, a.id, { kind: 'ASSIGN', targetShiftId: shiftA.id }),
          );
          await f.txA((tx) =>
            writeResponsibility(tx, b.id, { kind: 'ASSIGN', targetShiftId: shiftB.id }),
          );
          const result = await responsibilityRace({
            organizationId: f.a.organization.id,
            actor: f.a.user.id,
            isolationLevel,
            snapshot: (tx) => tx.order.findUniqueOrThrow({ where: { id: b.id } }),
            winner: (tx) =>
              writeFinancialCommand(tx, a.id, {
                cashShiftId: shiftB.id,
                payments: [{ amount: '10.01' }],
              }),
            loser: (tx) =>
              writeFinancialCommand(tx, b.id, {
                cashShiftId: shiftA.id,
                payments: [{ amount: '10.01' }],
              }),
          });
          if (isolationLevel === 'ReadCommitted') assert.equal(result.status, 'fulfilled');
          else {
            assert.equal(result.status, 'rejected');
            if (result.status === 'rejected')
              assert.ok(cashConflict(result.reason, /serialization/));
          }
          assert.equal(
            (
              await f.txA((tx) =>
                tx.orderResponsibility.findFirstOrThrow({ where: { orderId: a.id } }),
              )
            ).state,
            'RESOLVED',
          );
          assert.equal(
            await f.txA((tx) =>
              tx.paymentOperation.count({ where: { orderId: { in: [a.id, b.id] } } }),
            ),
            isolationLevel === 'ReadCommitted' ? 2 : 1,
          );
        },
      );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
