import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createWebsiteFixture } from './fixtures/website.fixture';
import { createInventoryFixture, publishInventoryRecipe } from './fixtures/inventory.fixture';
import { createModifierFixture, modifierRecipeData } from './fixtures/modifier.fixture';

test('PostgreSQL real: proveniență și brand imuabile, acceptare web cu sursă și cotă originală', async (t) => {
  const f = await createWebsiteFixture();
  try {
    await t.test('brandul este derivat din locație și nu poate fi rescris pe comandă', async () => {
      const unknown = await f.createDraft();
      assert.equal(unknown.order.source, 'POS');
      assert.equal(unknown.order.brandId, null);
      const brand = await f.txA((tx) =>
        tx.brand.create({
          data: { organizationId: f.a.organization.id, name: 'Brand sintetic', code: 'ORIG' },
        }),
      );
      await f.txA((tx) =>
        tx.location.update({ where: { id: f.locationA.id }, data: { brandId: brand.id } }),
      );
      const known = await f.createDraft();
      assert.equal(known.order.brandId, brand.id);
      await f.txA((tx) =>
        tx.location.update({ where: { id: f.locationA.id }, data: { brandId: null } }),
      );
      assert.equal(
        (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: known.order.id } })))
          .brandId,
        brand.id,
      );
      for (const change of [{ source: 'PHONE' }, { brandId: null }]) {
        await assert.rejects(
          f.txA((tx) =>
            tx.order.update({
              where: { id: known.order.id },
              data: { ...change, version: { increment: 1 } },
            }),
          ),
        );
      }
      assert.equal(
        await f.txB((tx) => tx.order.findUnique({ where: { id: known.order.id } })),
        null,
      );
    });
    await t.test(
      'acceptarea web nu poate ascunde canalul ori recaptura o cotă fiscală nouă',
      async () => {
        const unknown = await f.createInbound();
        await f.txA((tx) =>
          tx.product.update({
            where: { id: f.catalogA.product.id },
            data: { taxRate: '20', version: { increment: 1 } },
          }),
        );
        await assert.rejects(f.acceptInbound(unknown.id, { source: 'POS' }), /preserve origin/);
        await assert.rejects(
          f.acceptInbound(unknown.id, {}, { sourceWebsiteOrderItemId: null }),
          /preserve origin/,
        );
        const accepted = await f.acceptInbound(unknown.id);
        assert.equal(accepted.source, 'WEB');
        const item = await f.txA((tx) =>
          tx.orderItem.findFirstOrThrow({ where: { orderId: accepted.id } }),
        );
        assert.equal(item.taxRateSnapshot, null);
        assert.ok(item.sourceWebsiteOrderItemId);
        // A legitimate later draft edit does not replay the initial inbox-copy constraint.
        await f.txA(async (tx) => {
          await tx.orderItem.update({
            where: { id: item.id },
            data: { quantity: '2', lineTotal: '20.01' },
          });
          await tx.order.update({
            where: { id: accepted.id },
            data: { total: '20.01', version: { increment: 1 } },
          });
        });
      },
    );
    await t.test(
      'un canal WEB fără acceptare asociată și o origine null sunt refuzate',
      async () => {
        const template = await f.createDraft();
        for (const source of ['WEB', null]) {
          const { id: _id, createdAt: _created, updatedAt: _updated, ...data } = template.order;
          await assert.rejects(
            f.txA((tx) =>
              tx.order.create({
                data: {
                  ...data,
                  source,
                  number: data.number + 100,
                  clientRequestId: randomUUID(),
                  total: '0',
                },
              }),
            ),
            source === null ? /requires explicit origin/ : /requires accepted matching inbox/,
          );
        }
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});

test('PostgreSQL real: PICKUP este valid în rețete de bază și modificatori, fără servicii duplicate ori necunoscute', async () => {
  const f = await createInventoryFixture();
  try {
    const line = {
      inventoryItemId: f.packaging.id,
      purpose: 'PACKAGING',
      quantityPerUnit: '1',
      serviceTypes: ['PICKUP'],
    };
    const recipe = await publishInventoryRecipe(f, [line]);
    assert.deepEqual(recipe.components[0]!.serviceTypes, ['PICKUP']);
    const modifier = await createModifierFixture(f);
    const create = (serviceTypes: string[]) =>
      f.txA(async (tx) => {
        const version = await tx.modifierRecipeVersion.create({
          data: modifierRecipeData(f, modifier.options[0]!.id),
        });
        return tx.modifierRecipeComponent.create({
          data: {
            ...line,
            serviceTypes,
            organizationId: f.a.organization.id,
            modifierRecipeVersionId: version.id,
            position: 0,
          },
        });
      });
    for (const invalid of [
      [],
      ['PICKUP', 'PICKUP'],
      ['UNKNOWN'],
      ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'PICKUP', 'PICKUP'],
    ]) {
      await assert.rejects(publishInventoryRecipe(f, [{ ...line, serviceTypes: invalid }]));
      await assert.rejects(create(invalid));
    }
    const component = await create(['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'PICKUP']);
    assert.equal(component.serviceTypes.length, 4);
    assert.deepEqual(
      (
        await f.txA((tx) =>
          tx.recipeComponent.findUniqueOrThrow({ where: { id: recipe.components[0]!.id } }),
        )
      ).serviceTypes,
      ['PICKUP'],
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
