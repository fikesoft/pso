import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';

test('PostgreSQL real: nutriția și listele declarate păstrează integritatea și izolarea', async (t) => {
  const state = await createOperationsFixture();
  const id = state.catalogA.product.id;
  try {
    await t.test(
      'valorile vechi rămân necunoscute, iar zero și lista goală sunt explicite',
      async () => {
        assert.equal(state.catalogA.product.calories, null);
        assert.equal(state.catalogA.product.allergensDeclared, false);
        const saved = await state.txA((tx) =>
          tx.product.update({
            where: { id },
            data: {
              calories: '0.000',
              protein: '10.005',
              fat: null,
              carbs: '20',
              nutritionBasis: 'PER_100G',
              allergens: [],
              allergensDeclared: true,
              ingredients: ['Cafea', 'Lapte'],
              ingredientsDeclared: true,
              version: { increment: 1 },
            },
          }),
        );
        assert.equal(saved.calories!.toFixed(3), '0.000');
        assert.equal(saved.protein!.toFixed(3), '10.005');
        assert.equal(saved.fat, null);
        assert.deepEqual(saved.allergens, []);
        assert.equal(saved.allergensDeclared, true);
        assert.deepEqual(saved.ingredients, ['Cafea', 'Lapte']);
      },
    );
    await t.test(
      'constrângerile resping limite, NaN, liste invalide și declarații contradictorii',
      async () => {
        for (const field of ['calories', 'protein', 'fat', 'carbs'] as const) {
          await assert.rejects(
            state.txA((tx) =>
              tx.product.update({
                where: { id },
                data: { [field]: '-0.001', version: { increment: 1 } },
              }),
            ),
            /product_.*_range/,
          );
        }
        await assert.rejects(
          state.txA(
            (tx) =>
              tx.$executeRaw`UPDATE "Product" SET calories='NaN'::numeric,version=version+1 WHERE id=${id}::uuid`,
          ),
          /product_calories_range/,
        );
        for (const allergens of [
          ['MILK', 'milk'],
          [''],
          [' x'],
          ['x'.repeat(101)],
          Array.from({ length: 31 }, (_, index) => `A${index}`),
        ])
          await assert.rejects(
            state.txA((tx) =>
              tx.product.update({
                where: { id },
                data: { allergens, allergensDeclared: true, version: { increment: 1 } },
              }),
            ),
            /product_allergens_valid/,
          );
        await assert.rejects(
          state.txA(
            (tx) =>
              tx.$executeRaw`UPDATE "Product" SET allergens=ARRAY[NULL]::text[],version=version+1 WHERE id=${id}::uuid`,
          ),
          /product_allergens_valid/,
        );
        await assert.rejects(
          state.txA(
            (tx) =>
              tx.$executeRaw`UPDATE "Product" SET allergens=ARRAY[['A','B']],version=version+1 WHERE id=${id}::uuid`,
          ),
          /product_allergens_valid/,
        );
        await assert.rejects(
          state.txA((tx) =>
            tx.product.update({
              where: { id },
              data: { allergens: ['MILK'], allergensDeclared: false, version: { increment: 1 } },
            }),
          ),
          /product_allergens_valid/,
        );
        await assert.rejects(
          state.txA((tx) =>
            tx.product.update({
              where: { id },
              data: { nutritionBasis: 'UNKNOWN', version: { increment: 1 } },
            }),
          ),
          /product_nutrition_basis/,
        );
        await assert.rejects(
          state.txA((tx) => tx.product.update({ where: { id }, data: { protein: '9' } })),
          /version must increment/,
        );
      },
    );
    await t.test('un alt tenant nu poate vedea sau modifica declarația', async () => {
      assert.equal(await state.txB((tx) => tx.product.findUnique({ where: { id } })), null);
      assert.equal(
        (
          await state.txB((tx) =>
            tx.product.updateMany({
              where: { id },
              data: { allergens: ['GLUTEN'], allergensDeclared: true, version: { increment: 1 } },
            }),
          )
        ).count,
        0,
      );
      assert.equal(
        (await state.txA((tx) => tx.product.findUniqueOrThrow({ where: { id } }))).protein!.toFixed(
          3,
        ),
        '10.005',
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
