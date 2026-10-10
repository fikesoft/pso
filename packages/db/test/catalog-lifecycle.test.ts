import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { publishKitchenFixture } from './fixtures/operations-kitchen.fixture';
import { runCatalogConcurrencyTests } from './catalog-concurrency.cases';

test('PostgreSQL real: ordinea categoriilor și ciclul de viață al catalogului', async (t) => {
  const state = await createOperationsFixture();
  try {
    await t.test('sortarea este limitată și cere incrementarea versiunii', async () => {
      assert.equal(state.catalogA.category.sortOrder, 0);
      for (const sortOrder of [-1, 100001]) {
        await assert.rejects(
          state.txA((tx) =>
            tx.category.update({
              where: { id: state.catalogA.category.id },
              data: { sortOrder, version: { increment: 1 } },
            }),
          ),
          /category_sort_order_range/,
        );
      }
      await assert.rejects(
        state.txA((tx) =>
          tx.category.update({ where: { id: state.catalogA.category.id }, data: { sortOrder: 7 } }),
        ),
        /version must increment/,
      );
      const changed = await state.txA((tx) =>
        tx.category.update({
          where: { id: state.catalogA.category.id },
          data: { sortOrder: 100000, version: { increment: 1 } },
        }),
      );
      assert.equal(changed.sortOrder, 100000);
      assert.equal(changed.version, 2);
    });
    await t.test(
      'arhivarea păstrează istoricul și produsele active cer categorii active',
      async () => {
        const categoryId = state.catalogA.category.id;
        const productId = state.catalogA.product.id;
        const draft = await state.createDraft();
        await publishKitchenFixture(state, draft);
        const archiveCategory = () =>
          state.txA((tx) =>
            tx.category.update({
              where: { id: categoryId },
              data: { status: 'ARCHIVED', version: { increment: 1 } },
            }),
          );
        await assert.rejects(archiveCategory(), /product_active_category_fk/);
        await state.txA((tx) =>
          tx.product.update({
            where: { id: productId },
            data: { status: 'ARCHIVED', version: { increment: 1 } },
          }),
        );
        await archiveCategory();
        const edited = await state.txA((tx) =>
          tx.product.update({
            where: { id: productId },
            data: { name: 'Produs arhivat redenumit', categoryId, version: { increment: 1 } },
          }),
        );
        assert.equal(edited.categoryId, categoryId);
        assert.equal(edited.status, 'ARCHIVED');
        const restore = () =>
          state.txA((tx) =>
            tx.product.update({
              where: { id: productId },
              data: { status: 'ACTIVE', version: { increment: 1 } },
            }),
          );
        await assert.rejects(restore(), /product_active_category_fk/);
        await assert.rejects(
          state.txA((tx) =>
            tx.product.create({
              data: {
                organizationId: state.a.organization.id,
                categoryId,
                name: 'Produs nou respins',
                sku: randomUUID(),
                createdByUserId: state.a.user.id,
              },
            }),
          ),
          /product_active_category_fk/,
        );
        await assert.rejects(
          state.txA(
            (tx) => tx.$executeRaw`
          UPDATE "Product" SET "activeCategoryStatus"=NULL WHERE id=${productId}::uuid`,
          ),
          /428C9/,
        );
        await assert.rejects(
          state.txA((tx) =>
            tx.product.update({
              where: { id: productId },
              data: { categoryId: state.catalogB.category.id, version: { increment: 1 } },
            }),
          ),
        );
        const historical = await state.txA((tx) =>
          tx.orderItem.findUniqueOrThrow({ where: { id: draft.item.id } }),
        );
        assert.equal(historical.productId, productId);
        assert.equal(historical.productName, draft.item.productName);
        const uncategorized = await state.txA((tx) =>
          tx.product.create({
            data: {
              organizationId: state.a.organization.id,
              name: 'Produs fără categorie',
              sku: randomUUID(),
              createdByUserId: state.a.user.id,
            },
          }),
        );
        assert.equal(uncategorized.categoryId, null);
        assert.equal('activeCategoryStatus' in uncategorized, false);
        await assert.rejects(
          state.txA((tx) =>
            tx.product.update({
              where: { id: uncategorized.id },
              data: { categoryId, version: { increment: 1 } },
            }),
          ),
          /product_active_category_fk/,
        );
        await state.txA((tx) =>
          tx.category.update({
            where: { id: categoryId },
            data: { status: 'ACTIVE', version: { increment: 1 } },
          }),
        );
        assert.equal((await restore()).status, 'ACTIVE');
      },
    );
    await runCatalogConcurrencyTests(t, state);
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
