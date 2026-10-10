import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';

test('PostgreSQL real: metadatele fiscale ale produsului păstrează tenantul, versiunea și prețul', async (t) => {
  const state = await createOperationsFixture();
  const id = state.catalogA.product.id;
  const change = (taxRate: string | null) =>
    state.txA((tx) =>
      tx.product.update({
        where: { id },
        data: { taxRate, version: { increment: 1 } },
      }),
    );
  try {
    await t.test('null nu se transformă implicit în cotă zero', async () => {
      assert.equal(state.catalogA.product.taxRate, null);
      assert.equal((await change('0')).taxRate!.toFixed(4), '0.0000');
      assert.equal((await change(null)).taxRate, null);
    });
    await t.test('procentul exact nu schimbă prețul local sau comanda istorică', async () => {
      const historical = await state.createDraft();
      assert.equal((await change('7.1250')).taxRate!.toFixed(4), '7.1250');
      const [price, item] = await state.txA((tx) =>
        Promise.all([
          tx.locationProduct.findUniqueOrThrow({ where: { id: state.price.id } }),
          tx.orderItem.findUniqueOrThrow({ where: { id: historical.item.id } }),
        ]),
      );
      assert.equal(price.price.toFixed(4), state.price.price.toFixed(4));
      assert.equal(item.lineTotal.toFixed(2), historical.item.lineTotal.toFixed(2));
    });
    await t.test('baza refuză limitele, versiunea omisă și scrierea din alt tenant', async () => {
      for (const value of ['-0.0001', '100.0001'])
        await assert.rejects(change(value), /product_tax_rate_range/);
      await assert.rejects(
        state.txA(
          (tx) =>
            tx.$executeRaw`UPDATE "Product" SET "taxRate"='NaN'::numeric,version=version+1 WHERE id=${id}::uuid`,
        ),
        /product_tax_rate_range/,
      );
      await assert.rejects(
        state.txA((tx) => tx.product.update({ where: { id }, data: { taxRate: '1' } })),
        /version must increment/,
      );
      assert.equal(
        (
          await state.txB((tx) =>
            tx.product.updateMany({
              where: { id },
              data: { taxRate: '1', version: { increment: 1 } },
            }),
          )
        ).count,
        0,
      );
      assert.equal(
        (await state.txA((tx) => tx.product.findUniqueOrThrow({ where: { id } }))).taxRate!.toFixed(
          4,
        ),
        '7.1250',
      );
    });
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
