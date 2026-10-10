import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { createModifierFixture, modifierRecipeData } from './fixtures/modifier.fixture';
import { runModifierCatalogRaces } from './modifier-catalog-concurrency.cases';

test('PostgreSQL real: grupuri, opțiuni și rețete imuabile de modificatori', async (t) => {
  const state = await createOperationsFixture();
  const modifier = await createModifierFixture(state);
  try {
    await t.test('RLS și FK tenant, versiuni și configurație satisfiabilă', async () => {
      assert.equal(modifier.group.version, 4);
      assert.equal(await state.runtime.modifierGroup.count(), 0);
      assert.equal(await state.txB((tx) => tx.modifierGroup.count()), 0);
      await assert.rejects(state.auth.modifierGroup.findMany());
      await assert.rejects(state.platform.modifierGroup.findMany());
      await assert.rejects(
        state.txB((tx) =>
          tx.modifierOption.create({
            data: {
              organizationId: state.b.organization.id,
              modifierGroupId: modifier.group.id,
              name: 'Cross tenant',
              extraPrice: '1',
            },
          }),
        ),
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.modifierGroup.update({
            where: { id: modifier.group.id },
            data: { name: 'Fără versiune' },
          }),
        ),
        /version must increment/,
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.modifierGroup.update({
            where: { id: modifier.group.id },
            data: { minSelections: 3, maxSelections: 3, version: { increment: 1 } },
          }),
        ),
        /satisfiable/,
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.modifierGroup.update({
            where: { id: modifier.group.id },
            data: { status: 'ARCHIVED', version: { increment: 1 } },
          }),
        ),
        /satisfiable/,
      );
      await assert.rejects(
        state.txA((tx) => tx.modifierOption.delete({ where: { id: modifier.options[0]!.id } })),
      );
      await state.txA((tx) =>
        tx.modifierOption.update({
          where: { id: modifier.options[0]!.id },
          data: { status: 'ARCHIVED', version: { increment: 1 } },
        }),
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.modifierOption.update({
            where: { id: modifier.options[1]!.id },
            data: { status: 'ARCHIVED', version: { increment: 1 } },
          }),
        ),
        /satisfiable/,
      );
      await state.txA((tx) =>
        tx.modifierOption.update({
          where: { id: modifier.options[0]!.id },
          data: { status: 'ACTIVE', version: { increment: 1 } },
        }),
      );
    });
    await t.test('limite de selecții/preț/opțiuni și identități fixe', async () => {
      for (const extraPrice of ['-0.0001', '1000000'])
        await assert.rejects(
          state.txA((tx) =>
            tx.modifierOption.update({
              where: { id: modifier.options[0]!.id },
              data: { extraPrice, version: { increment: 1 } },
            }),
          ),
        );
      await assert.rejects(
        state.txA((tx) =>
          tx.modifierGroup.update({
            where: { id: modifier.group.id },
            data: { maxSelections: 11, version: { increment: 1 } },
          }),
        ),
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.productModifierGroup.update({
            where: { id: modifier.binding.id },
            data: { productId: state.catalogB.product.id, version: { increment: 1 } },
          }),
        ),
        /identity is immutable/,
      );
      await assert.rejects(
        state.txA(async (tx) => {
          for (let index = 0; index < 19; index += 1)
            await tx.modifierOption.create({
              data: {
                organizationId: state.a.organization.id,
                modifierGroupId: modifier.group.id,
                name: `Opțiune ${index}`,
                extraPrice: '0',
              },
            });
        }),
        /twenty options/,
      );
    });
    await t.test(
      'lipsa configurării diferă de versiunea goală publicată; componente sigilate',
      async () => {
        const optionId = modifier.options[0]!.id;
        assert.equal(
          await state.txA((tx) =>
            tx.modifierRecipeVersion.count({ where: { modifierOptionId: optionId } }),
          ),
          0,
        );
        const empty = await state.txA((tx) =>
          tx.modifierRecipeVersion.create({ data: modifierRecipeData(state, optionId) }),
        );
        assert.equal(
          await state.txA((tx) =>
            tx.modifierRecipeComponent.count({ where: { modifierRecipeVersionId: empty.id } }),
          ),
          0,
        );
        const componentData = {
          organizationId: state.a.organization.id,
          modifierRecipeVersionId: empty.id,
          inventoryItemId: modifier.item.id,
          position: 0,
          purpose: 'AUXILIARY',
          quantityPerUnit: '0.333',
          serviceTypes: ['DINE_IN'],
        };
        await assert.rejects(
          state.txA((tx) => tx.modifierRecipeComponent.create({ data: componentData })),
          /creation transaction/,
        );
        const published = await state.txA(async (tx) => {
          const recipe = await tx.modifierRecipeVersion.create({
            data: modifierRecipeData(state, optionId, 2),
          });
          const component = await tx.modifierRecipeComponent.create({
            data: { ...componentData, modifierRecipeVersionId: recipe.id },
          });
          return { recipe, component };
        });
        await assert.rejects(
          state.txA((tx) =>
            tx.modifierRecipeVersion.create({ data: modifierRecipeData(state, optionId, 4) }),
          ),
          /follow latest/,
        );
        await assert.rejects(
          state.txA((tx) =>
            tx.modifierRecipeComponent.update({
              where: { id: published.component.id },
              data: { quantityPerUnit: '10' },
            }),
          ),
        );
        await assert.rejects(
          state.txA((tx) => tx.modifierRecipeVersion.delete({ where: { id: empty.id } })),
        );
      },
    );
    await runModifierCatalogRaces(t, state);
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
