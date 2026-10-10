import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';

test('PostgreSQL real: regulile upsell păstrează proveniența, locația și istoricul', async (t) => {
  const state = await createOperationsFixture();
  try {
    const target = await state.txA(async (tx) => {
      const product = await tx.product.create({
        data: {
          organizationId: state.a.organization.id,
          name: 'Recomandare sintetică',
          sku: 'UPSELL',
          createdByUserId: state.a.user.id,
        },
      });
      await tx.locationProduct.create({
        data: {
          organizationId: state.a.organization.id,
          locationId: state.locationA.id,
          productId: product.id,
          price: '5',
        },
      });
      return product;
    });
    const input = () => ({
      organizationId: state.a.organization.id,
      locationId: state.locationA.id,
      sourceProductId: state.catalogA.product.id,
      targetProductId: target.id,
      name: 'Recomandare',
      requestKey: randomUUID(),
      requestHash: 'a'.repeat(64),
      createdByUserId: state.a.user.id,
    });
    const rule = await state.txA((tx) => tx.upsellRule.create({ data: input() }));
    await t.test(
      'RLS și cheile compuse împiedică legăturile cu alt tenant sau altă locație',
      async () => {
        assert.equal(
          await state.txB((tx) => tx.upsellRule.findUnique({ where: { id: rule.id } })),
          null,
        );
        assert.equal(
          (
            await state.txB((tx) =>
              tx.upsellRule.updateMany({
                where: { id: rule.id },
                data: { name: 'Interzis', version: { increment: 1 } },
              }),
            )
          ).count,
          0,
        );
        await assert.rejects(
          state.txA((tx) =>
            tx.upsellRule.create({ data: { ...input(), locationId: state.locationB.id } }),
          ),
          /foreign key|constraint/,
        );
        await assert.rejects(
          state.txA((tx) =>
            tx.upsellRule.create({
              data: { ...input(), targetProductId: state.catalogB.product.id },
            }),
          ),
          /foreign key|constraint/,
        );
        await assert.rejects(
          state.txA((tx) =>
            tx.upsellRule.create({
              data: {
                ...input(),
                sourceProductId: target.id,
                targetProductId: state.catalogA.product.id,
                createdByUserId: state.b.user.id,
              },
            }),
          ),
          /current actor/,
        );
      },
    );
    await t.test('versiunea și identitatea regulii sunt protejate în DB', async () => {
      await assert.rejects(
        state.txA((tx) =>
          tx.upsellRule.update({ where: { id: rule.id }, data: { name: 'Fără versiune' } }),
        ),
        /version must advance/,
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.upsellRule.update({
            where: { id: rule.id },
            data: { sourceProductId: target.id, version: { increment: 1 } },
          }),
        ),
        /identity is immutable/,
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.upsellRule.create({
            data: {
              ...input(),
              sourceProductId: target.id,
              targetProductId: state.catalogA.product.id,
              version: 2,
            },
          }),
        ),
        /initial version/,
      );
      await assert.rejects(
        state.txA((tx) => tx.upsellRule.delete({ where: { id: rule.id } })),
        /permission denied|immutable/,
      );
    });
    await t.test('perechile active sunt unice iar arhivarea păstrează istoricul', async () => {
      await assert.rejects(
        state.txA((tx) => tx.upsellRule.create({ data: input() })),
        /Unique constraint/,
      );
      await state.txA((tx) =>
        tx.upsellRule.update({
          where: { id: rule.id },
          data: { status: 'ARCHIVED', version: { increment: 1 } },
        }),
      );
      const next = await state.txA((tx) => tx.upsellRule.create({ data: input() }));
      assert.notEqual(next.id, rule.id);
      await assert.rejects(
        state.txA((tx) =>
          tx.upsellRule.update({
            where: { id: rule.id },
            data: { status: 'ACTIVE', version: { increment: 1 } },
          }),
        ),
        /Unique constraint/,
      );
      assert.equal(
        (await state.txA((tx) => tx.upsellRule.findUniqueOrThrow({ where: { id: rule.id } })))
          .status,
        'ARCHIVED',
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
