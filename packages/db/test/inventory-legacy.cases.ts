import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { prepareLegacyInventoryOrder } from './fixtures/inventory-legacy.fixture';
import { prepareCheckoutOrder, writeCheckout } from './fixtures/checkout.fixture';
import { finalizeInventoryOrder } from './fixtures/inventory-finalize.fixture';
import type { InventoryFixture } from './fixtures/inventory.types';

export async function runInventoryLegacyTests(t: TestContext, state: InventoryFixture) {
  await t.test(
    'excepția istorică este creată doar de migrație; checkout nu inventează consum',
    async () => {
      const historical = await prepareLegacyInventoryOrder(state);
      const marker = await state.txA((tx) =>
        tx.inventoryLegacyOrder.findUniqueOrThrow({ where: { orderId: historical.id } }),
      );
      assert.equal(marker.reason, 'UNTRACKED_BEFORE_RESERVATIONS');
      assert.deepEqual(await state.runtime.inventoryLegacyOrder.findMany(), []);
      assert.deepEqual(await state.txB((tx) => tx.inventoryLegacyOrder.findMany()), []);
      const fresh = await prepareCheckoutOrder(state);
      await assert.rejects(
        state.txA((tx) =>
          tx.inventoryLegacyOrder.create({
            data: { ...marker, orderId: fresh.id },
          }),
        ),
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.inventoryLegacyOrder.update({
            where: { orderId: historical.id },
            data: { orderId: fresh.id },
          }),
        ),
      );
      await assert.rejects(
        state.txA((tx) => tx.inventoryLegacyOrder.delete({ where: { orderId: historical.id } })),
      );
      await assert.rejects(writeCheckout(state, fresh, {}, { skipInventory: true }));
      await finalizeInventoryOrder(state, { order: historical });
      assert.equal(
        await state.txA((tx) => tx.inventoryDocument.count({ where: { orderId: historical.id } })),
        0,
      );
      assert.equal(
        (await state.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: historical.id } })))
          .status,
        'COMPLETED',
      );
    },
  );
}
