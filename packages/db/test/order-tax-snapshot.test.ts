import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';

test('PostgreSQL real: cota salvată a liniei este derivată pe server și imuabilă', async (t) => {
  const f = await createOperationsFixture();
  try {
    const unknown = await f.createDraft();
    await f.txA((tx) =>
      tx.product.update({
        where: { id: f.catalogA.product.id },
        data: { taxRate: '20.1250', version: { increment: 1 } },
      }),
    );
    const known = await f.createDraft();
    await t.test('cota nouă nu completează retroactiv valoarea necunoscută', async () => {
      assert.equal(known.item.taxRateSnapshot?.toFixed(4), '20.1250');
      const old = await f.txA((tx) =>
        tx.orderItem.findUniqueOrThrow({ where: { id: unknown.item.id } }),
      );
      assert.equal(old.taxRateSnapshot, null);
      await assert.rejects(
        f.txA((tx) =>
          tx.orderItem.update({ where: { id: old.id }, data: { taxRateSnapshot: '20.1250' } }),
        ),
        /tax snapshot is immutable/,
      );
      assert.equal(
        await f.txB((tx) => tx.orderItem.findUnique({ where: { id: known.item.id } })),
        null,
      );
    });
    await t.test(
      'editarea cantității păstrează cota; o cotă furnizată la inserare nu poate falsifica catalogul',
      async () => {
        await f.txA((tx) =>
          tx.product.update({
            where: { id: f.catalogA.product.id },
            data: { taxRate: '0', version: { increment: 1 } },
          }),
        );
        await f.txA(async (tx) => {
          await tx.orderItem.update({
            where: { id: known.item.id },
            data: { quantity: '2', lineTotal: '20.01' },
          });
          await tx.order.update({
            where: { id: known.order.id },
            data: { total: '20.01', version: { increment: 1 } },
          });
        });
        assert.equal(
          (
            await f.txA((tx) => tx.orderItem.findUniqueOrThrow({ where: { id: known.item.id } }))
          ).taxRateSnapshot?.toFixed(4),
          '20.1250',
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.orderItem.update({ where: { id: known.item.id }, data: { taxRateSnapshot: null } }),
          ),
          /tax snapshot is immutable/,
        );
        const zero = await f.createDraft();
        assert.equal(zero.item.taxRateSnapshot?.toFixed(4), '0.0000');
        const derived = await f.txA(async (tx) => {
          await tx.orderItem.delete({ where: { id: zero.item.id } });
          return tx.orderItem.create({
            data: {
              organizationId: f.a.organization.id,
              locationId: f.locationA.id,
              orderId: zero.order.id,
              productId: f.catalogA.product.id,
              productName: f.catalogA.product.name,
              productSku: f.catalogA.product.sku,
              position: 0,
              unitPrice: '10.0050',
              quantity: '1',
              lineTotal: '10.01',
              taxRateSnapshot: '99',
            },
          });
        });
        assert.equal(derived.taxRateSnapshot?.toFixed(4), '0.0000');
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
