import { consumeOrder } from '../../../apps/api/src/entities/inventory';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { inventoryBalance, publishInventoryRecipe } from './fixtures/inventory.fixture';
import { sendInventoryOrder } from './fixtures/inventory-send.fixture';
import { finalizeInventoryOrder, readyInventoryOrder } from './fixtures/inventory-finalize.fixture';
import type { InventoryFixture } from './fixtures/inventory.types';

export async function runInventoryConsumptionTests(t: TestContext, state: InventoryFixture) {
  const main = {
    inventoryItemId: state.ingredient.id,
    purpose: 'MAIN',
    quantityPerUnit: '0.125',
    serviceTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
  };
  await t.test(
    'SEND rezervă exact, fără mișcări; finalizarea consumă snapshotul o singură dată',
    async () => {
      await publishInventoryRecipe(state, [
        main,
        {
          inventoryItemId: state.packaging.id,
          purpose: 'PACKAGING',
          quantityPerUnit: '2.000',
          serviceTypes: ['TAKEAWAY'],
        },
      ]);
      const sent = await sendInventoryOrder(state);
      assert.equal(sent.reservation.status, 'PENDING');
      assert.deepEqual(sent.movements.map((line) => line.quantity.toFixed(6)).sort(), [
        '0.140625',
        '2.250000',
      ]);
      assert.equal(await inventoryBalance(state, state.ingredient.id), '0.000000');
      assert.equal(
        await state.txA((tx) => tx.inventoryDocument.count({ where: { orderId: sent.order.id } })),
        0,
      );
      await publishInventoryRecipe(state, [{ ...main, quantityPerUnit: '100.000' }]);
      await state.txA((tx) =>
        tx.inventoryItem.update({
          where: { id: state.ingredient.id },
          data: {
            name: 'Denumire nouă',
            status: 'ARCHIVED',
            version: { increment: 1 },
          },
        }),
      );
      await readyInventoryOrder(state, sent);
      await assert.rejects(finalizeInventoryOrder(state, sent, true));
      assert.equal(await inventoryBalance(state, state.ingredient.id), '0.000000');
      assert.equal(
        (
          await state.txA((tx) =>
            tx.inventoryReservation.findUniqueOrThrow({ where: { id: sent.reservation.id } }),
          )
        ).status,
        'PENDING',
      );
      await finalizeInventoryOrder(state, sent);
      assert.equal(await inventoryBalance(state, state.ingredient.id), '-0.140625');
      assert.equal(await inventoryBalance(state, state.packaging.id), '-2.250000');
      // The same early exit preserves immutable historical send-time documents after upgrade.
      const existing = await state.txA((tx) =>
        consumeOrder(tx, {
          organizationId: state.a.organization.id,
          locationId: sent.order.locationId,
          orderId: sent.order.id,
          requestKey: randomUUID(),
          requestHash: '0'.repeat(64),
          actorUserId: state.a.user.id,
          actorName: 'Administrator sintetic',
        }),
      );
      assert.equal(existing, null);
      assert.equal(
        await state.txA((tx) => tx.inventoryDocument.count({ where: { orderId: sent.order.id } })),
        1,
      );
      await assert.rejects(finalizeInventoryOrder(state, sent));
      assert.equal(await inventoryBalance(state, state.ingredient.id), '-0.140625');
      const movement = await state.txA((tx) =>
        tx.inventoryMovement.findFirstOrThrow({
          where: {
            orderItemId: sent.movements[0]!.orderItemId,
            inventoryItemId: state.ingredient.id,
          },
        }),
      );
      assert.equal(movement.itemName, state.ingredient.name);
      await state.txA((tx) =>
        tx.inventoryItem.update({
          where: { id: state.ingredient.id },
          data: { status: 'ACTIVE', version: { increment: 1 } },
        }),
      );
    },
  );
  await t.test('rezervările sunt tenant-scoped, complete, imuabile și sigilate', async () => {
    await publishInventoryRecipe(state, [main]);
    await assert.rejects(sendInventoryOrder(state, { movement: { quantity: '1' } }));
    await assert.rejects(sendInventoryOrder(state, { movement: { productName: 'Falsificat' } }));
    await assert.rejects(
      sendInventoryOrder(state, { movement: { inventoryItemId: state.foreignItem.id } }),
    );
    await assert.rejects(
      sendInventoryOrder(state, { movement: { locationId: state.locationA2.id } }),
    );
    await assert.rejects(sendInventoryOrder(state, { omitMovements: true }));
    const sent = await sendInventoryOrder(state);
    const line = sent.movements[0]!;
    await assert.rejects(
      state.txA((tx) =>
        tx.inventoryReservationLine.update({ where: { id: line.id }, data: { quantity: '1' } }),
      ),
    );
    await assert.rejects(
      state.txA((tx) => tx.inventoryReservationLine.delete({ where: { id: line.id } })),
    );
    await assert.rejects(
      state.txA((tx) =>
        tx.inventoryReservationLine.create({ data: { ...line, id: randomUUID() } }),
      ),
    );
    await assert.rejects(
      state.txA((tx) =>
        tx.inventoryReservation.update({
          where: { id: sent.reservation.id },
          data: { status: 'CONSUMED', resolvedAt: new Date() },
        }),
      ),
    );
    await assert.rejects(
      state.txA((tx) =>
        tx.inventoryReservation.update({
          where: { id: sent.reservation.id },
          data: { status: 'RELEASED', resolvedAt: new Date() },
        }),
      ),
    );
    assert.deepEqual(await state.txB((tx) => tx.inventoryReservation.findMany()), []);
    assert.deepEqual(await state.txB((tx) => tx.inventoryReservationLine.findMany()), []);
    assert.deepEqual(await state.runtime.inventoryReservation.findMany(), []);
    assert.deepEqual(await state.runtime.inventoryReservationLine.findMany(), []);
    for (const client of [state.auth, state.platform]) {
      await assert.rejects(client.inventoryReservation.findMany());
      await assert.rejects(client.inventoryReservationLine.findMany());
    }
  });
  await t.test('rețeta goală rămâne goală după publicări ulterioare, fără backfill', async () => {
    await publishInventoryRecipe(state, []);
    const sent = await sendInventoryOrder(state);
    assert.equal(sent.movements.length, 0);
    await publishInventoryRecipe(state, [main]);
    await readyInventoryOrder(state, sent);
    const before = await inventoryBalance(state, state.ingredient.id);
    await finalizeInventoryOrder(state, sent);
    assert.equal(await inventoryBalance(state, state.ingredient.id), before);
    assert.equal(
      (
        await state.txA((tx) =>
          tx.inventoryReservation.findUniqueOrThrow({ where: { id: sent.reservation.id } }),
        )
      ).status,
      'CONSUMED',
    );
  });
}
