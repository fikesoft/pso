import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { OperationsFixture } from './fixtures/operations.types';

export async function runOrderIntegrityTests(t: TestContext, state: OperationsFixture) {
  const { txA, a, price, catalogA } = state;
  await t.test(
    'catalogul se actualizează prin versiuni și se arhivează fără ștergere',
    async () => {
      await assert.rejects(
        txA((tx) =>
          tx.locationProduct.update({
            where: { id: price.id },
            data: { price: '11.00' },
          }),
        ),
      );
      await assert.rejects(
        txA((tx) =>
          tx.locationProduct.update({
            where: { id: price.id },
            data: { price: '-1', version: { increment: 1 } },
          }),
        ),
      );
      await assert.rejects(
        txA(
          (tx) => tx.$executeRaw`
      UPDATE "LocationProduct" SET price='NaN',version=version+1 WHERE id=${price.id}::uuid`,
        ),
      );
      await txA((tx) =>
        tx.locationProduct.update({
          where: { id: price.id },
          data: { price: '11.25', version: { increment: 1 } },
        }),
      );
      const results = await Promise.all([
        txA((tx) =>
          tx.product.updateMany({
            where: { id: catalogA.product.id, version: 1 },
            data: { description: 'Descriere sintetică A', version: { increment: 1 } },
          }),
        ),
        txA((tx) =>
          tx.product.updateMany({
            where: { id: catalogA.product.id, version: 1 },
            data: { description: 'Descriere sintetică B', version: { increment: 1 } },
          }),
        ),
      ]);
      assert.equal(
        results.reduce((sum, result) => sum + result.count, 0),
        1,
      );
      await assert.rejects(txA((tx) => tx.product.delete({ where: { id: catalogA.product.id } })));
      await assert.rejects(
        txA((tx) => tx.category.delete({ where: { id: catalogA.category.id } })),
      );
    },
  );
  await t.test(
    'numeric exact: half-up per linie, cantitate pozitivă și sumă validată la commit',
    async () => {
      const { order, item } = await state.createDraft();
      assert.equal(item.unitPrice.toFixed(4), '10.0050');
      assert.equal(item.lineTotal.toFixed(2), '10.01');
      assert.equal(order.total.toFixed(2), '10.01');
      for (const data of [
        { productName: 'Denumire retroactivă' },
        { productSku: 'SKU-RETROACTIV' },
        { unitPrice: '10.0051', lineTotal: '10.01' },
      ]) {
        await assert.rejects(txA((tx) => tx.orderItem.update({ where: { id: item.id }, data })));
      }
      await assert.rejects(
        txA((tx) =>
          tx.orderItem.update({
            where: { id: item.id },
            data: { quantity: '0', lineTotal: '0' },
          }),
        ),
      );
      await assert.rejects(
        txA((tx) =>
          tx.orderItem.update({
            where: { id: item.id },
            data: { lineTotal: '10.00' },
          }),
        ),
      );
      await assert.rejects(
        txA((tx) =>
          tx.order.update({
            where: { id: order.id },
            data: { total: '10.02', version: { increment: 1 } },
          }),
        ),
      );
      await assert.rejects(
        txA((tx) =>
          tx.orderItem.update({
            where: { id: item.id },
            data: { quantity: '2', lineTotal: '20.01' },
          }),
        ),
      );
      const updated = await txA(async (tx) => {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { quantity: '2', lineTotal: '20.01' },
        });
        return tx.order.update({
          where: { id: order.id },
          data: { total: '20.01', version: { increment: 1 } },
        });
      });
      assert.equal(updated.total.toFixed(2), '20.01');
    },
  );
  await t.test('identitatea/idempotenta comenzii sunt unice și nu pot fi rescrise', async () => {
    const { order } = await state.createDraft();
    await assert.rejects(
      txA((tx) =>
        tx.order.create({
          data: { ...order, id: randomUUID() },
        }),
      ),
      { code: 'P2002' },
    );
    await assert.rejects(
      txA((tx) =>
        tx.order.create({
          data: { ...order, id: randomUUID(), number: 200001 },
        }),
      ),
      { code: 'P2002' },
    );
    for (const data of [
      { clientRequestId: randomUUID() },
      { creationRequestHash: 'a'.repeat(64) },
      { number: 200002 },
      { currency: 'EUR' },
      { status: 'OPEN' },
    ]) {
      await assert.rejects(
        txA((tx) =>
          tx.order.update({
            where: { id: order.id },
            data: { ...data, version: { increment: 1 } },
          }),
        ),
      );
    }
    await assert.rejects(txA((tx) => tx.order.delete({ where: { id: order.id } })));
    const outcomes = await Promise.all([
      txA((tx) =>
        tx.order.updateMany({
          where: { id: order.id, version: 1 },
          data: { notes: 'A', version: { increment: 1 } },
        }),
      ),
      txA((tx) =>
        tx.order.updateMany({
          where: { id: order.id, version: 1 },
          data: { notes: 'B', version: { increment: 1 } },
        }),
      ),
    ]);
    assert.equal(
      outcomes.reduce((sum, result) => sum + result.count, 0),
      1,
    );
  });
  await t.test(
    'pozițiile articolelor pot fi schimbate atomic; istoricul statusurilor este append-only',
    async () => {
      const { order, item } = await state.createDraft();
      const second = await txA(async (tx) => {
        const row = await tx.orderItem.create({ data: { ...item, id: randomUUID(), position: 1 } });
        await tx.order.update({
          where: { id: order.id },
          data: { total: '20.02', version: { increment: 1 } },
        });
        return row;
      });
      await txA(async (tx) => {
        await tx.orderItem.update({ where: { id: item.id }, data: { position: 1 } });
        await tx.orderItem.update({ where: { id: second.id }, data: { position: 0 } });
        await tx.order.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
      });
      await assert.rejects(
        txA((tx) => tx.orderItem.update({ where: { id: second.id }, data: { position: 1 } })),
      );
      const event = await txA(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
        return tx.orderStatusEvent.create({
          data: {
            organizationId: a.organization.id,
            locationId: order.locationId,
            orderId: order.id,
            actorUserId: a.user.id,
            kind: 'ORDER',
            fromStatus: 'DRAFT',
            toStatus: 'DRAFT',
          },
        });
      });
      await assert.rejects(
        txA((tx) =>
          tx.orderStatusEvent.update({ where: { id: event.id }, data: { toStatus: 'OPEN' } }),
        ),
      );
      await assert.rejects(txA((tx) => tx.orderStatusEvent.delete({ where: { id: event.id } })));
      await txA(async (tx) => {
        await tx.orderItem.delete({ where: { id: second.id } });
        await tx.order.update({
          where: { id: order.id },
          data: { total: '10.01', version: { increment: 1 } },
        });
      });
    },
  );
}
