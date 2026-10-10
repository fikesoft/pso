import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createResponsibilityFixture,
  writeResponsibility,
} from './fixtures/order-responsibility.fixture';
import { prepareCheckoutOrder, checkoutData } from './fixtures/checkout.fixture';
import { responsibilityCheckout } from './fixtures/responsibility-checkout.fixture';
import { responsibilityRace } from './fixtures/responsibility-race.fixture';
import { cashConflict } from './fixtures/cash-conflict.fixture';
test('PostgreSQL real: MANUAL/DEMO versus ASSIGN, ordine observată RC/RR', async (t) => {
  const f = await createResponsibilityFixture();
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const)
      for (const mode of ['MANUAL', 'DEMO'] as const)
        for (const assignFirst of [true, false])
          await t.test(`${isolationLevel}: ${mode}, assignFirst=${assignFirst}`, async () => {
            const order = await prepareCheckoutOrder(f),
              data = await checkoutData(f, order);
            const result = await responsibilityRace({
              organizationId: f.a.organization.id,
              actor: f.a.user.id,
              isolationLevel,
              snapshot: (tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }),
              winner: (tx) =>
                assignFirst
                  ? writeResponsibility(tx, order.id, { kind: 'ASSIGN', targetShiftId: f.shift.id })
                  : responsibilityCheckout(tx, data, mode, f.shift.id),
              loser: (tx) =>
                assignFirst
                  ? responsibilityCheckout(tx, data, mode, f.shift.id)
                  : writeResponsibility(tx, order.id, {
                      kind: 'ASSIGN',
                      targetShiftId: f.shift.id,
                    }),
            });
            const success = isolationLevel === 'ReadCommitted' && assignFirst;
            if (success) assert.equal(result.status, 'fulfilled');
            else {
              assert.equal(result.status, 'rejected');
              if (result.status === 'rejected')
                assert.ok(
                  cashConflict(
                    result.reason,
                    /current order and responsibility versions|not eligible/,
                  ),
                  String(result.reason),
                );
            }
            const projection = await f.txA((tx) =>
              tx.orderResponsibility.findFirst({ where: { orderId: order.id } }),
            );
            assert.equal(
              projection?.state ?? null,
              assignFirst ? (success ? 'RESOLVED' : 'ASSIGNED') : null,
            );
            assert.equal(
              await f.txA((tx) => tx.checkout.count({ where: { orderId: order.id } })),
              assignFirst && !success ? 0 : 1,
            );
            assert.equal(
              await f.txA((tx) => tx.payment.count({ where: { orderId: order.id } })),
              mode === 'MANUAL' && (!assignFirst || success) ? 1 : 0,
            );
            if (success) {
              const event = await f.txA((tx) =>
                tx.orderResponsibilityEvent.findUniqueOrThrow({
                  where: { id: projection!.lastEventId },
                }),
              );
              assert.equal(event.kind, mode === 'DEMO' ? 'RESOLVED_DEMO' : 'RESOLVED_PAID');
            }
          });
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
