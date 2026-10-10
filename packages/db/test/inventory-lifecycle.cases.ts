import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { consumeOrder, stockLevels } from '../../../apps/api/src/entities/inventory';
import { createDatabaseClient, Prisma, withTenantTransaction } from '../src';
import { checkoutData } from './fixtures/checkout.fixture';
import { readyInventoryOrder } from './fixtures/inventory-finalize.fixture';
import { sendInventoryOrder } from './fixtures/inventory-send.fixture';
import { inventoryBalance, publishInventoryRecipe } from './fixtures/inventory.fixture';
import { publishKitchenFixture } from './fixtures/operations-kitchen.fixture';
import type { InventoryFixture } from './fixtures/inventory.types';

export async function runInventoryLifecycleTests(t: TestContext, state: InventoryFixture) {
  await t.test(
    'o trimitere nouă fără rezervare și consumul înainte de finalizare sunt respinse',
    async () => {
      const draft = await state.createDraft();
      await assert.rejects(
        publishKitchenFixture(state, draft, { omitReservation: true }),
        /require inventory reservation/,
      );
      const unchanged = await state.txA((tx) =>
        tx.order.findUniqueOrThrow({ where: { id: draft.order.id } }),
      );
      assert.equal(unchanged.status, 'DRAFT');
      assert.equal(
        await state.txA((tx) => tx.kitchenTicket.count({ where: { orderId: draft.order.id } })),
        0,
      );
      const sent = await sendInventoryOrder(state);
      const checkout = await checkoutData(state, sent.order);
      await assert.rejects(
        state.txA((tx) =>
          consumeOrder(tx, {
            organizationId: checkout.organizationId,
            locationId: checkout.locationId,
            orderId: checkout.orderId,
            requestKey: checkout.requestKey,
            requestHash: checkout.requestHash,
            actorUserId: checkout.createdByUserId,
            actorName: checkout.cashierName,
          }),
        ),
        /consumption requires pending reservation and atomic completion/,
      );
      assert.equal(
        await state.txA((tx) => tx.inventoryDocument.count({ where: { orderId: sent.order.id } })),
        0,
      );
    },
  );
  await t.test(
    'anularea eliberează atomic rezerva și stocul disponibil, fără mișcare fizică',
    async () => {
      await publishInventoryRecipe(state, [
        {
          inventoryItemId: state.ingredient.id,
          purpose: 'MAIN',
          quantityPerUnit: '0.125',
          serviceTypes: ['TAKEAWAY'],
        },
      ]);
      const sent = await sendInventoryOrder(state);
      const levels = () =>
        state.txA((tx) => stockLevels(tx, sent.order.locationId, [state.ingredient.id]));
      const before = (await levels()).get(state.ingredient.id)!;
      const cancel = (release: boolean, fail = false) =>
        state.txA(async (tx) => {
          await tx.kitchenTicket.update({
            where: { id: sent.ticket.id },
            data: {
              status: 'CANCELLED',
              updatedByUserId: state.a.user.id,
              version: { increment: 1 },
            },
          });
          await tx.order.update({
            where: { id: sent.order.id },
            data: { status: 'CANCELLED', version: { increment: 1 } },
          });
          if (release) {
            await tx.inventoryReservation.update({
              where: { id: sent.reservation.id },
              data: { status: 'RELEASED', resolvedAt: new Date() },
            });
          }
          await tx.orderStatusEvent.create({
            data: {
              organizationId: state.a.organization.id,
              locationId: sent.order.locationId,
              orderId: sent.order.id,
              kind: 'ORDER',
              fromStatus: 'CONFIRMED',
              toStatus: 'CANCELLED',
              actorUserId: state.a.user.id,
              reason: 'Anulare sintetică cu rezervare eliberată',
            },
          });
          if (fail) throw new Error('Rollback sintetic după eliberare');
        });
      await assert.rejects(cancel(false), /matching inventory reservation resolution/);
      await assert.rejects(cancel(true, true), /Rollback sintetic după eliberare/);
      assert.deepEqual((await levels()).get(state.ingredient.id), before);
      await cancel(true);
      const after = (await levels()).get(state.ingredient.id)!;
      assert.equal(after.balance, before.balance);
      const reserved = sent.movements[0]!.quantity;
      assert.equal(
        new Prisma.Decimal(before.reservedQuantity).sub(reserved).toFixed(6),
        after.reservedQuantity,
      );
      const stored = await state.txA(async (tx) => ({
        order: await tx.order.findUniqueOrThrow({ where: { id: sent.order.id } }),
        ticket: await tx.kitchenTicket.findUniqueOrThrow({ where: { id: sent.ticket.id } }),
        reservation: await tx.inventoryReservation.findUniqueOrThrow({
          where: { id: sent.reservation.id },
        }),
        lines: await tx.inventoryReservationLine.count({
          where: { reservationId: sent.reservation.id },
        }),
        documents: await tx.inventoryDocument.count({ where: { orderId: sent.order.id } }),
      }));
      assert.equal(stored.order.status, 'CANCELLED');
      assert.equal(stored.ticket.status, 'CANCELLED');
      assert.equal(stored.reservation.status, 'RELEASED');
      assert.ok(stored.reservation.resolvedAt);
      assert.equal(stored.lines, sent.movements.length);
      assert.equal(stored.documents, 0);
      await assert.rejects(cancel(true));
      assert.deepEqual((await levels()).get(state.ingredient.id), after);
    },
  );
  await t.test(
    'două conexiuni PostgreSQL finalizează aceeași rezervă cel mult o singură dată',
    async () => {
      const sent = await sendInventoryOrder(state);
      const order = await readyInventoryOrder(state, sent);
      const payloads = await Promise.all([checkoutData(state, order), checkoutData(state, order)]);
      const clients = payloads.map(() => createDatabaseClient(process.env.TEST_DATABASE_URL!, 1));
      const before = await inventoryBalance(state, state.ingredient.id);
      let release!: () => void;
      let abort!: (error: Error) => void;
      const barrier = new Promise<void>((resolve, reject) => {
        release = resolve;
        abort = reject;
      });
      const barrierTimeout = setTimeout(
        () => abort(new Error('Ambele conexiuni trebuie să intre în tranzacție simultan')),
        5000,
      );
      const backends = new Set<number>();
      try {
        const results = await Promise.allSettled(
          clients.map((client, index) =>
            withTenantTransaction(
              client,
              { organizationId: state.a.organization.id, userId: state.a.user.id },
              async (tx) => {
                const rows = await tx.$queryRaw<
                  Array<{ pid: number }>
                >`SELECT pg_backend_pid() AS pid`;
                backends.add(rows[0]!.pid);
                if (backends.size === 2) release();
                await barrier;
                const checkout = await tx.checkout.create({ data: payloads[index]! });
                await tx.order.update({
                  where: { id: sent.order.id },
                  data: { status: 'COMPLETED', version: { increment: 1 } },
                });
                await consumeOrder(tx, {
                  organizationId: checkout.organizationId,
                  locationId: checkout.locationId,
                  orderId: checkout.orderId,
                  requestKey: checkout.requestKey,
                  requestHash: checkout.requestHash,
                  actorUserId: checkout.createdByUserId,
                  actorName: checkout.cashierName,
                });
              },
            ),
          ),
        );
        assert.equal(backends.size, 2);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
        const stored = await state.txA(async (tx) => ({
          reservation: await tx.inventoryReservation.findUniqueOrThrow({
            where: { id: sent.reservation.id },
          }),
          checkouts: await tx.checkout.count({ where: { orderId: sent.order.id } }),
          documents: await tx.inventoryDocument.count({ where: { orderId: sent.order.id } }),
          movements: await tx.inventoryMovement.findMany({
            where: { orderItemId: sent.movements[0]!.orderItemId },
          }),
        }));
        assert.equal(stored.reservation.status, 'CONSUMED');
        assert.equal(stored.checkouts, 1);
        assert.equal(stored.documents, 1);
        assert.equal(stored.movements.length, sent.movements.length);
        assert.equal(stored.movements[0]!.quantity.toFixed(6), '-0.140625');
        assert.equal(
          stored.movements[0]!.quantity.add(before).toFixed(6),
          await inventoryBalance(state, state.ingredient.id),
        );
      } finally {
        clearTimeout(barrierTimeout);
        release();
        await Promise.all(clients.map((client) => client.$disconnect()));
      }
    },
  );
}
