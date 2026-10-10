import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { OperationsFixture } from './fixtures/operations.types';
import { publishKitchenFixture } from './fixtures/operations-kitchen.fixture';

export async function runKitchenIntegrityTests(t: TestContext, state: OperationsFixture) {
  const { txA, txB, a, catalogA } = state;
  await t.test(
    'ticketul cere snapshot complet, aceeași comandă/locație și publicare atomică',
    async () => {
      const draft = await state.createDraft();
      const other = await state.createDraft('a', state.locationA2.id);
      const foreign = await state.createDraft('b');
      for (const options of [
        { omitItems: true },
        { leaveDraft: true },
        { productName: 'Denumire falsificată' },
        { orderItemId: other.item.id },
        { orderItemId: foreign.item.id },
        { locationId: state.locationA2.id },
        { locationId: state.locationB.id },
      ]) {
        await assert.rejects(publishKitchenFixture(state, draft, options));
      }
      assert.equal(await txA((tx) => tx.kitchenTicket.count()), 0);
      assert.equal(
        (await txA((tx) => tx.order.findUniqueOrThrow({ where: { id: draft.order.id } }))).status,
        'DRAFT',
      );
    },
  );
  const draft = await state.createDraft();
  const { ticket, item } = await publishKitchenFixture(state, draft);
  assert.ok(item);
  await t.test(
    'snapshotul trimis rămâne imuabil chiar după schimbarea prețului/catalogului',
    async () => {
      await assert.rejects(
        txA((tx) =>
          tx.orderItem.update({
            where: { id: draft.item.id },
            data: { quantity: '2', lineTotal: '20.01' },
          }),
        ),
      );
      await assert.rejects(txA((tx) => tx.orderItem.delete({ where: { id: draft.item.id } })));
      await assert.rejects(
        txA((tx) =>
          tx.orderItem.create({
            data: {
              ...draft.item,
              id: randomUUID(),
              position: 2,
            },
          }),
        ),
      );
      await assert.rejects(
        txA((tx) =>
          tx.order.update({
            where: { id: draft.order.id },
            data: { notes: 'Istoric rescris', version: { increment: 1 } },
          }),
        ),
      );
      await assert.rejects(
        txA((tx) =>
          tx.kitchenTicketItem.update({
            where: { id: item.id },
            data: { productName: 'Istoric rescris' },
          }),
        ),
      );
      await assert.rejects(txA((tx) => tx.kitchenTicketItem.delete({ where: { id: item.id } })));
      await assert.rejects(
        txA((tx) =>
          tx.kitchenTicketItem.create({
            data: {
              ...item,
              modifierSnapshot: [],
              id: randomUUID(),
              position: 3,
            },
          }),
        ),
      );
      await assert.rejects(txA((tx) => tx.kitchenTicket.delete({ where: { id: ticket.id } })));
      await txA((tx) =>
        tx.product.update({
          where: { id: catalogA.product.id },
          data: { name: 'Denumire actualizată', status: 'ARCHIVED', version: { increment: 1 } },
        }),
      );
      await txA((tx) =>
        tx.locationProduct.update({
          where: { id: state.price.id },
          data: { price: '99.00', version: { increment: 1 } },
        }),
      );
      const saved = await txA((tx) =>
        tx.orderItem.findUniqueOrThrow({ where: { id: draft.item.id } }),
      );
      assert.equal(saved.productName, 'Produs sintetic');
      assert.equal(saved.unitPrice.toFixed(4), '10.0050');
      assert.equal(saved.lineTotal.toFixed(2), '10.01');
      assert.equal('unitPrice' in item, false);
      assert.equal('lineTotal' in item, false);
      assert.deepEqual(await txB((tx) => tx.kitchenTicket.findMany()), []);
      assert.deepEqual(await txB((tx) => tx.kitchenTicketItem.findMany()), []);
      assert.deepEqual(await state.runtime.order.findMany(), []);
      assert.deepEqual(await state.runtime.orderItem.findMany(), []);
      assert.deepEqual(await state.runtime.kitchenTicket.findMany(), []);
      assert.deepEqual(await state.runtime.kitchenTicketItem.findMany(), []);
    },
  );
  await t.test('bucătăria are tranziții versionate și consistente cu comanda', async () => {
    await assert.rejects(
      txA((tx) =>
        tx.kitchenTicket.update({
          where: { id: ticket.id },
          data: { status: 'READY', version: { increment: 1 }, updatedByUserId: a.user.id },
        }),
      ),
    );
    await assert.rejects(
      txA((tx) =>
        tx.kitchenTicket.update({
          where: { id: ticket.id },
          data: { status: 'PREPARING', version: { increment: 1 }, updatedByUserId: a.user.id },
        }),
      ),
    );
    for (const status of ['PREPARING', 'READY']) {
      await txA(async (tx) => {
        await tx.kitchenTicket.update({
          where: { id: ticket.id },
          data: { status, version: { increment: 1 }, updatedByUserId: a.user.id },
        });
        await tx.order.update({
          where: { id: draft.order.id },
          data: {
            status: 'IN_PROGRESS',
            kitchenStatus: status,
            version: { increment: 1 },
            updatedByUserId: a.user.id,
          },
        });
      });
    }
    await assert.rejects(
      txA((tx) =>
        tx.kitchenTicket.update({
          where: { id: ticket.id },
          data: { status: 'NEW', version: { increment: 1 }, updatedByUserId: a.user.id },
        }),
      ),
    );
    const ready = await txA((tx) =>
      tx.kitchenTicket.findUniqueOrThrow({ where: { id: ticket.id } }),
    );
    assert.equal(ready.status, 'READY');
    assert.equal(ready.version, 3);
    assert.equal(ready.orderVersion, 2);
    await assert.rejects(publishKitchenFixture(state, draft));
  });
}
