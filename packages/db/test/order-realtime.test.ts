import { completePackingFixture } from './fixtures/packing-complete.fixture';
import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { creationOrderData } from './fixtures/order-creation.fixture';
import { publishKitchenFixture } from './fixtures/operations-kitchen.fixture';
import { watchOrderNotifications } from './fixtures/order-realtime.fixture';
import { writeFinancialCommand } from './fixtures/payment-ledger.fixture';

test('PostgreSQL real: evenimentele comenzilor sunt atomice și notificate numai după commit', async (t) => {
  const f = await createOperationsFixture();
  const cashShift = await openCashShiftFixture(f);
  const listener = await watchOrderNotifications(f.a.organization.id);
  try {
    await t.test(
      'rollback elimină evenimentul și notificarea, inclusiv un eveniment deja creat în tranzacție',
      async () => {
        const key = randomUUID();
        await assert.rejects(
          f.txA(async (tx) => {
            const order = await tx.order.create({
              data: creationOrderData(f, key, { number: 99 }),
            });
            assert.equal(await tx.orderRealtimeEvent.count({ where: { orderId: order.id } }), 1);
            await listener.barrier();
            assert.equal(listener.messages.length, 0);
            throw new Error('Rollback sintetic');
          }),
          /Rollback sintetic/,
        );
        await listener.barrier();
        assert.equal(listener.messages.length, 0);
        assert.equal(await f.txA((tx) => tx.orderRealtimeEvent.count()), 0);
        assert.equal(
          await f.txA((tx) => tx.orderCreationClaim.count({ where: { requestKey: key } })),
          0,
        );
      },
    );
    const draft = await f.createDraft();
    await t.test(
      'crearea și editarea au identități unice pe versiune, iar recitirea nu publică din nou',
      async () => {
        await listener.barrier();
        const created = await f.txA((tx) =>
          tx.orderRealtimeEvent.findFirstOrThrow({ where: { orderId: draft.order.id } }),
        );
        assert.equal(created.type, 'order.created');
        assert.equal(created.orderVersion, 1);
        assert.equal(created.amountSnapshot.toFixed(2), draft.order.total.toFixed(2));
        assert.deepEqual(listener.messages, [
          { eventId: created.id, organizationId: f.a.organization.id, locationId: f.locationA.id },
        ]);
        await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: draft.order.id } }));
        await listener.barrier();
        assert.equal(listener.messages.length, 1);
        await f.txA((tx) =>
          tx.order.update({
            where: { id: draft.order.id },
            data: { notes: 'Actualizare sintetică', version: { increment: 1 } },
          }),
        );
        await listener.barrier();
        const events = await f.txA((tx) =>
          tx.orderRealtimeEvent.findMany({
            where: { orderId: draft.order.id },
            orderBy: { orderVersion: 'asc' },
          }),
        );
        assert.deepEqual(
          events.map((event) => [event.type, event.orderVersion]),
          [
            ['order.created', 1],
            ['order.updated', 2],
          ],
        );
        assert.equal(listener.messages.length, 2);
      },
    );
    await t.test(
      'progresul bucătăriei, plata și anularea au tipul corect fără repetarea READY',
      async () => {
        const readyDraft = await f.createDraft();
        const sent = await publishKitchenFixture(f, readyDraft);
        for (const status of ['PREPARING', 'READY'])
          await f.txA(async (tx) => {
            await tx.kitchenTicket.update({
              where: { id: sent.ticket.id },
              data: { status, version: { increment: 1 }, updatedByUserId: f.a.user.id },
            });
            await tx.order.update({
              where: { id: readyDraft.order.id },
              data: {
                status: 'IN_PROGRESS',
                kitchenStatus: status,
                version: { increment: 1 },
              },
            });
          });
        await f.txA((tx) => completePackingFixture(tx, readyDraft.order.id, f.a.user.id));
        await f.txA((tx) =>
          writeFinancialCommand(tx, readyDraft.order.id, {
            cashShiftId: cashShift.id,
            payments: [{ amount: '1.00' }],
          }),
        );
        const events = await f.txA((tx) =>
          tx.orderRealtimeEvent.findMany({
            where: { orderId: readyDraft.order.id },
            orderBy: { orderVersion: 'asc' },
          }),
        );
        assert.deepEqual(
          events.map((event) => event.type),
          [
            'order.created',
            'order.updated',
            'order.updated',
            'order.updated',
            'order.ready',
            'order.updated',
          ],
        );
        assert.deepEqual(
          events.map((event) => event.orderVersion),
          [1, 2, 3, 4, 5, 6],
        );
        await listener.barrier();
        const beforeFailedPayment = listener.messages.length;
        await assert.rejects(
          f.txA((tx) =>
            writeFinancialCommand(tx, readyDraft.order.id, {
              cashShiftId: cashShift.id,
              payments: [{ amount: '1.00' }],
              omit: 'lines',
            }),
          ),
          /commit together/,
        );
        await listener.barrier();
        assert.equal(listener.messages.length, beforeFailedPayment);
        assert.equal(
          await f.txA((tx) =>
            tx.orderRealtimeEvent.count({ where: { orderId: readyDraft.order.id } }),
          ),
          6,
        );
        const cancelDraft = await f.createDraft();
        await f.txA((tx) =>
          tx.order.update({
            where: { id: cancelDraft.order.id },
            data: { status: 'CANCELLED', version: { increment: 1 } },
          }),
        );
        const cancelled = await f.txA((tx) =>
          tx.orderRealtimeEvent.findFirstOrThrow({
            where: { orderId: cancelDraft.order.id, orderVersion: 2 },
          }),
        );
        assert.equal(cancelled.type, 'order.cancelled');
        await listener.barrier();
        assert.equal(listener.messages.length, await f.txA((tx) => tx.orderRealtimeEvent.count()));
      },
    );
  } finally {
    await listener.close();
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
