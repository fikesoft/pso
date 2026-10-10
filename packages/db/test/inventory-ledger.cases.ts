import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { createDatabaseClient, withTenantTransaction } from '../src/index';
import { inventoryBalance } from './fixtures/inventory.fixture';
import {
  inventoryDocumentData,
  inventoryMovementData,
  writeInventoryMovement,
} from './fixtures/inventory-ledger.fixture';
import type { InventoryFixture } from './fixtures/inventory.types';

export async function runInventoryLedgerTests(t: TestContext, state: InventoryFixture) {
  await t.test(
    'registrul exact permite stoc negativ și inventariere fizică cu delta verificată',
    async () => {
      const item = await state.createItem('COUNT-EXACT');
      await writeInventoryMovement(state, item, 'RECEIPT', '1.123456');
      await writeInventoryMovement(state, item, 'WASTE', '-2.000001');
      assert.equal(await inventoryBalance(state, item.id), '-0.876545');
      await assert.rejects(
        writeInventoryMovement(state, item, 'COUNT', '1', { countedQuantity: '1' }),
      );
      await writeInventoryMovement(state, item, 'COUNT', '1.876545', {
        countedQuantity: '1.000000',
      });
      await writeInventoryMovement(state, item, 'COUNT', '0', { countedQuantity: '1' });
      assert.equal(await inventoryBalance(state, item.id), '1.000000');
      for (const [kind, quantity] of [
        ['RECEIPT', '0'],
        ['RECEIPT', '-1'],
        ['WASTE', '0'],
        ['WASTE', '1'],
        ['COUNT', 'NaN'],
      ]) {
        await assert.rejects(writeInventoryMovement(state, item, kind!, quantity!));
      }
      await assert.rejects(
        writeInventoryMovement(state, item, 'RECEIPT', '1', { countedQuantity: '1' }),
      );
    },
  );
  await t.test('soldul rămâne reprezentabil numeric18,6 chiar după mai multe mișcări', async () => {
    const item = await state.createItem('BOUNDED-BALANCE');
    await writeInventoryMovement(state, item, 'RECEIPT', '999999999999.999999');
    await assert.rejects(writeInventoryMovement(state, item, 'RECEIPT', '0.000001'));
    assert.equal(await inventoryBalance(state, item.id), '999999999999.999999');
    await writeInventoryMovement(state, item, 'WASTE', '-999999999999.999999');
    await writeInventoryMovement(state, item, 'WASTE', '-999999999999.999999');
    await assert.rejects(writeInventoryMovement(state, item, 'WASTE', '-0.000001'));
  });
  await t.test(
    'documentele și liniile sunt append-only și nu acceptă completări târzii sau snapshot fals',
    async () => {
      const item = await state.createItem('SEALED-LEDGER');
      const { document, movement } = await writeInventoryMovement(state, item, 'RECEIPT', '10');
      await assert.rejects(
        state.txA((tx) =>
          tx.inventoryDocument.update({
            where: { id: document.id },
            data: { reason: 'Rescriere' },
          }),
        ),
      );
      await assert.rejects(
        state.txA((tx) => tx.inventoryDocument.delete({ where: { id: document.id } })),
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.inventoryMovement.update({ where: { id: movement.id }, data: { quantity: '100' } }),
        ),
      );
      await assert.rejects(
        state.txA((tx) => tx.inventoryMovement.delete({ where: { id: movement.id } })),
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.inventoryMovement.create({
            data: {
              ...movement,
              id: randomUUID(),
              inventoryItemId: state.packaging.id,
              itemName: state.packaging.name,
              itemSku: state.packaging.sku,
              unit: state.packaging.unit,
            },
          }),
        ),
      );
      await assert.rejects(
        writeInventoryMovement(state, item, 'RECEIPT', '1', { itemName: 'Falsificat' }),
      );
      await assert.rejects(
        writeInventoryMovement(state, item, 'RECEIPT', '1', { locationId: state.locationA2.id }),
      );
      await assert.rejects(
        writeInventoryMovement(state, item, 'RECEIPT', '1', {
          inventoryItemId: state.foreignItem.id,
        }),
      );
      await assert.rejects(
        state.txA(async (tx) =>
          tx.inventoryDocument.create({
            data: {
              ...(await inventoryDocumentData(tx, state, 'RECEIPT')),
              actorName: 'Actor falsificat',
            },
          }),
        ),
      );
      await assert.rejects(
        state.txA(async (tx) =>
          tx.inventoryDocument.create({
            data: await inventoryDocumentData(tx, state, 'RECEIPT'),
          }),
        ),
      );
      assert.deepEqual(await state.txB((tx) => tx.inventoryDocument.findMany()), []);
      assert.deepEqual(await state.txB((tx) => tx.inventoryMovement.findMany()), []);
      assert.deepEqual(await state.runtime.inventoryMovement.findMany(), []);
    },
  );
  await t.test('două COUNT simultane nu pot aplica aceeași delta pe un sold vechi', async () => {
    const item = await state.createItem('CONCURRENT-COUNT');
    const client = createDatabaseClient(process.env.TEST_DATABASE_URL!, 2);
    let arrivals = 0;
    let release: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const attempt = () =>
      withTenantTransaction(
        client,
        {
          organizationId: state.a.organization.id,
          userId: state.a.user.id,
        },
        async (tx) => {
          const document = await tx.inventoryDocument.create({
            data: await inventoryDocumentData(tx, state, 'COUNT'),
          });
          arrivals += 1;
          if (arrivals === 2) release();
          await barrier;
          return tx.inventoryMovement.create({
            data: {
              ...inventoryMovementData(state, item, document.id, '1'),
              countedQuantity: '1',
            },
          });
        },
      );
    try {
      const results = await Promise.allSettled([attempt(), attempt()]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
      assert.equal(await inventoryBalance(state, item.id), '1.000000');
    } finally {
      await client.$disconnect();
    }
  });
}
