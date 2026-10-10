import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { createModifierFixture, modifierRecipeData } from './fixtures/modifier.fixture';
import { createModifierDraft, markModifierKitchenReady } from './fixtures/modifier-order.fixture';
import { publishKitchenFixture } from './fixtures/operations-kitchen.fixture';
import { writeCheckout } from './fixtures/checkout.fixture';

test('PostgreSQL real: snapshoturi de modificatori, bucătărie și proveniența consumului', async (t) => {
  const state = await createOperationsFixture();
  try {
    const modifier = await createModifierFixture(state);
    await state.txA(async (tx) => {
      const optional = await tx.modifierGroup.create({
        data: {
          organizationId: state.a.organization.id,
          name: 'Grup opțional fără selecții',
          createdByUserId: state.a.user.id,
        },
      });
      await tx.productModifierGroup.create({
        data: {
          organizationId: state.a.organization.id,
          productId: state.catalogA.product.id,
          modifierGroupId: optional.id,
        },
      });
    });
    await t.test(
      'toate grupurile, inclusiv zero opționale, și sumele sunt verificate la commit',
      async () => {
        for (const options of [
          { omitGroups: true },
          { omitSelection: true },
          { extraPrice: '0' },
          { groupName: 'Etichetă falsă' },
        ]) {
          await assert.rejects(createModifierDraft(state, modifier, options));
        }
        const draft = await createModifierDraft(state, modifier);
        assert.equal(draft.item.baseUnitPrice.toFixed(4), '10.0050');
        assert.equal(draft.item.unitPrice.toFixed(4), '10.3383');
        assert.equal(draft.item.lineTotal.toFixed(2), '12.76');
        const groups = await state.txA((tx) =>
          tx.orderItemModifierGroup.findMany({ where: { orderItemId: draft.item.id } }),
        );
        assert.equal(groups.length, 2);
        assert.equal(await state.txB((tx) => tx.orderItemModifierGroup.count()), 0);
        assert.equal(await state.runtime.orderItemModifier.count(), 0);
        const selected = await state.txA((tx) =>
          tx.orderItemModifier.findFirstOrThrow({ where: { orderItemId: draft.item.id } }),
        );
        await state.txA((tx) =>
          tx.modifierOption.update({
            where: { id: modifier.options[0]!.id },
            data: { name: 'Preț și nume noi', extraPrice: '0.9999', version: { increment: 1 } },
          }),
        );
        const historical = await state.txA((tx) =>
          tx.orderItemModifier.findUniqueOrThrow({ where: { id: selected.id } }),
        );
        assert.equal(historical.optionName, selected.optionName);
        assert.equal(historical.extraPrice.toFixed(4), '0.3333');
        await assert.rejects(
          state.txA((tx) =>
            tx.orderItemModifier.update({ where: { id: selected.id }, data: { extraPrice: '0' } }),
          ),
        );
        await assert.rejects(
          state.txA(async (tx) => {
            await tx.orderItem.update({ where: { id: draft.item.id }, data: { note: 'xmin nou' } });
            await tx.orderItemModifier.create({
              data: {
                ...selected,
                id: randomUUID(),
                modifierOptionId: modifier.options[1]!.id,
                optionName: modifier.options[1]!.name,
                extraPrice: modifier.options[1]!.extraPrice,
                position: 1,
              },
            });
          }),
          /line creation transaction/,
        );
        await assert.rejects(
          state.txA(
            (tx) =>
              tx.$executeRaw`UPDATE "OrderItem" SET "modifierCreatedTransaction"=txid_current() WHERE id=${draft.item.id}::uuid`,
          ),
          /retained line/,
        );
        await state.txA(async (tx) => {
          await tx.orderItem.delete({ where: { id: draft.item.id } });
          await tx.order.update({
            where: { id: draft.order.id },
            data: { total: '0', version: { increment: 1 } },
          });
        });
        assert.equal(
          await state.txA((tx) =>
            tx.orderItemModifier.count({ where: { orderItemId: draft.item.id } }),
          ),
          0,
        );
      },
    );
    await t.test(
      'trimiterea neconfigurată se retrage; rețeta goală declară explicit lipsa consumului',
      async () => {
        const draft = await createModifierDraft(state, modifier);
        await assert.rejects(publishKitchenFixture(state, draft));
        assert.equal(
          await state.txA((tx) => tx.kitchenTicket.count({ where: { orderId: draft.order.id } })),
          0,
        );
        await state.txA((tx) =>
          tx.modifierRecipeVersion.create({
            data: modifierRecipeData(state, modifier.options[0]!.id),
          }),
        );
        const sent = await publishKitchenFixture(state, draft);
        const snapshot = sent.item!.modifierSnapshot as {
          groupName: string;
          options: { optionName: string; extraPrice: string }[];
        }[];
        assert.equal(snapshot.length, 2);
        assert.equal(snapshot.flatMap((group) => group.options).length, 1);
        assert.equal(snapshot.flatMap((group) => group.options)[0]!.optionName, 'Preț și nume noi');
        assert.equal(
          await state.txA((tx) =>
            tx.inventoryReservationLine.count({ where: { orderItemId: draft.item.id } }),
          ),
          0,
        );
      },
    );
    await t.test(
      'rezervă sursa opțiunii exact, consumă snapshotul vechi o singură dată',
      async () => {
        const recipe = await state.txA(async (tx) => {
          const version = await tx.modifierRecipeVersion.create({
            data: modifierRecipeData(state, modifier.options[0]!.id, 2),
          });
          return tx.modifierRecipeComponent.create({
            data: {
              organizationId: state.a.organization.id,
              modifierRecipeVersionId: version.id,
              inventoryItemId: modifier.item.id,
              position: 0,
              purpose: 'AUXILIARY',
              quantityPerUnit: '0.333',
              serviceTypes: ['DINE_IN'],
            },
          });
        });
        const draft = await createModifierDraft(state, modifier);
        const sent = await publishKitchenFixture(state, draft);
        const reserved = await state.txA((tx) =>
          tx.inventoryReservationLine.findFirstOrThrow({ where: { orderItemId: draft.item.id } }),
        );
        assert.equal(reserved.recipeComponentId, null);
        assert.equal(reserved.modifierRecipeComponentId, recipe.id);
        assert.ok(reserved.orderItemModifierId);
        assert.equal(reserved.quantity.toFixed(6), '0.410922');
        assert.equal(
          await state.txA((tx) =>
            tx.inventoryMovement.count({ where: { orderItemId: draft.item.id } }),
          ),
          0,
        );
        await state.txA((tx) =>
          tx.modifierRecipeVersion.create({
            data: modifierRecipeData(state, modifier.options[0]!.id, 3),
          }),
        );
        await assert.rejects(
          state.txA((tx) =>
            tx.inventoryReservationLine.create({
              data: { ...reserved, id: randomUUID(), modifierRecipeComponentId: null },
            }),
          ),
        );
        const ready = await markModifierKitchenReady(state, sent.ticket.id, draft.order.id);
        await writeCheckout(state, ready);
        const consumed = await state.txA((tx) =>
          tx.inventoryMovement.findFirstOrThrow({ where: { orderItemId: draft.item.id } }),
        );
        assert.equal(consumed.modifierRecipeComponentId, recipe.id);
        assert.equal(consumed.orderItemModifierId, reserved.orderItemModifierId);
        assert.equal(consumed.quantity.toFixed(6), '-0.410922');
        await assert.rejects(writeCheckout(state, ready));
        assert.equal(
          await state.txA((tx) =>
            tx.inventoryMovement.count({ where: { orderItemId: draft.item.id } }),
          ),
          1,
        );
        await assert.rejects(
          state.txA((tx) => tx.orderItem.delete({ where: { id: draft.item.id } })),
        );
      },
    );
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
