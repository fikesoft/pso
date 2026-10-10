import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { publishKitchenFixture } from './fixtures/operations-kitchen.fixture';

test('PostgreSQL: identitatea de alertare este stabilită la trimitere și rămâne imuabilă', async () => {
  const f = await createOperationsFixture();
  try {
    const first = await publishKitchenFixture(f, await f.createDraft(), {
      alertIdentity: {
        productId: f.catalogB.product.id,
        categoryId: f.catalogB.category.id,
        categorySnapshotKnown: false,
      },
    });
    assert.equal(first.item?.productId, f.catalogA.product.id);
    assert.equal(first.item?.categoryId, f.catalogA.category.id);
    assert.equal(first.item?.categorySnapshotKnown, true);
    const category = await f.txA((tx) =>
      tx.category.create({
        data: {
          organizationId: f.a.organization.id,
          name: 'Categorie nouă',
        },
      }),
    );
    await f.txA((tx) =>
      tx.product.update({
        where: { id: f.catalogA.product.id },
        data: { categoryId: category.id, version: { increment: 1 } },
      }),
    );
    const second = await publishKitchenFixture(f, await f.createDraft());
    assert.equal(second.item?.categoryId, category.id);
    assert.deepEqual(
      await f.txA((tx) =>
        tx.kitchenTicketItem.findUniqueOrThrow({
          where: { id: first.item!.id },
        }),
      ),
      first.item,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenTicketItem.updateMany({
          data: { categoryId: category.id },
        }),
      ),
      /permission denied/,
    );
    assert.equal(await f.txB((tx) => tx.kitchenTicketItem.count()), 0);
    const policies = await f.runtime.$queryRaw<Array<{ policyname: string }>>`
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND policyname='migration_alert_backfill'`;
    assert.equal(policies.length, 0);
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
