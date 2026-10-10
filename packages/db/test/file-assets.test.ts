import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { assetData, mutationData, setFixtureAsset } from './fixtures/file-assets.fixture';
import { runFileAssetConcurrencyTests } from './file-assets-concurrency.cases';

test('PostgreSQL real: fișiere locale private și registru de mutații', async (t) => {
  const state = await createOperationsFixture();
  try {
    await t.test('RLS forțat, context obligatoriu și actor autentic', async () => {
      const rows = await state.runtime.$queryRaw<
        { relrowsecurity: boolean; relforcerowsecurity: boolean }[]
      >`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('FileAsset','FileAssetMutation')`;
      assert.equal(rows.length, 2);
      assert.ok(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity));
      await assert.rejects(state.runtime.fileAsset.create({ data: assetData(state) }));
      await assert.rejects(state.txB((tx) => tx.fileAsset.create({ data: assetData(state) })));
      await assert.rejects(
        state.txA((tx) =>
          tx.fileAsset.create({
            data: { ...assetData(state), createdByUserId: state.b.user.id },
          }),
        ),
      );
      assert.equal(await state.runtime.fileAsset.count(), 0);
      await assert.rejects(state.auth.fileAsset.findMany());
      await assert.rejects(state.platform.fileAsset.findMany());
    });
    await t.test('normalizarea are limite DB și cheie de stocare canonică', async () => {
      for (const patch of [
        { storageKey: '../private.env' },
        { mimeType: 'image/svg+xml' },
        { size: 0 },
        { size: 2097153 },
        { width: 1281 },
        { height: 0 },
        { checksum: 'not-a-checksum' },
        { locationId: state.locationA.id },
        { purpose: 'STAFF_AVATAR', employeeId: state.a.user.id },
        { productId: state.catalogB.product.id },
      ]) {
        await assert.rejects(
          state.txA((tx) => tx.fileAsset.create({ data: { ...assetData(state), ...patch } })),
        );
      }
      await assert.rejects(
        state.txA((tx) =>
          tx.fileAsset.create({ data: { ...assetData(state, 'STAFF_AVATAR'), width: 513 } }),
        ),
      );
      const before = Date.now();
      const asset = await state.txA((tx) =>
        tx.fileAsset.create({
          data: { ...assetData(state), createdAt: new Date('2000-01-01T00:00:00Z') },
        }),
      );
      assert.ok(asset.createdAt.getTime() >= before - 1000);
      assert.equal(await state.txB((tx) => tx.fileAsset.count()), 0);
      for (const mutation of ['update', 'delete'] as const) {
        await assert.rejects(
          state.txA((tx) =>
            mutation === 'delete'
              ? tx.fileAsset.delete({ where: { id: asset.id } })
              : tx.fileAsset.update({
                  where: { id: asset.id },
                  data: { checksum: 'c'.repeat(64) },
                }),
          ),
        );
      }
    });
    await t.test('avatarul și produsul cer proprietarul corect și registru atomic', async () => {
      const avatar = await state.txA((tx) =>
        tx.fileAsset.create({ data: assetData(state, 'STAFF_AVATAR') }),
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.companyUser.update({
            where: { id: state.a.user.id },
            data: { avatarAssetId: avatar.id },
          }),
        ),
        /avatar change requires resource version increment/,
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.companyUser.update({
            where: { id: state.a.user.id },
            data: { avatarAssetId: avatar.id, version: { increment: 1 } },
          }),
        ),
        /file asset pointer changes require an immutable mutation/,
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.product.update({
            where: { id: state.catalogA.product.id },
            data: { imageAssetId: avatar.id, version: { increment: 1 } },
          }),
        ),
        /product_image_asset_fk/,
      );
      const otherProduct = await state.txA((tx) =>
        tx.product.create({
          data: {
            organizationId: state.a.organization.id,
            name: 'Alt produs',
            sku: randomUUID(),
            createdByUserId: state.a.user.id,
          },
        }),
      );
      const product = await state.txA((tx) => setFixtureAsset(state, tx));
      await assert.rejects(
        state.txA((tx) =>
          tx.product.update({
            where: { id: otherProduct.id },
            data: { imageAssetId: product.asset.id, version: { increment: 1 } },
          }),
        ),
        /product_image_asset_fk/,
      );
      const staff = await state.txA((tx) => setFixtureAsset(state, tx, 'STAFF_AVATAR'));
      assert.equal(staff.resource.version, 2);
      assert.equal(product.resource.version, 2);
    });
    await t.test('eliminarea păstrează fișierul și retry-ul rezultatului inițial', async () => {
      const initial = await state.txA((tx) =>
        tx.fileAssetMutation.findFirstOrThrow({ where: { productId: state.catalogA.product.id } }),
      );
      const clear = await state.txA(async (tx) => {
        const product = await tx.product.update({
          where: { id: state.catalogA.product.id },
          data: { imageAssetId: null, version: { increment: 1 } },
        });
        return tx.fileAssetMutation.create({
          data: { ...mutationData(state, null, product.version), createdAt: new Date(0) },
        });
      });
      assert.equal(clear.action, 'CLEAR');
      assert.ok(clear.createdAt.getTime() > Date.now() - 10000);
      const replay = await state.txA((tx) =>
        tx.fileAssetMutation.findUniqueOrThrow({
          where: {
            organizationId_actorUserId_requestKey: {
              organizationId: initial.organizationId,
              actorUserId: initial.actorUserId,
              requestKey: initial.requestKey,
            },
          },
        }),
      );
      assert.equal(replay.assetId, initial.assetId);
      assert.equal(replay.resourceVersion, 2);
      assert.ok(
        await state.txA((tx) => tx.fileAsset.findUnique({ where: { id: initial.assetId! } })),
      );
      assert.equal(await state.txB((tx) => tx.fileAssetMutation.count()), 0);
      for (const patch of [{ resourceVersion: 999 }, { actorUserId: state.b.user.id }]) {
        await assert.rejects(
          state.txA((tx) =>
            tx.fileAssetMutation.create({ data: { ...mutationData(state, null, 3), ...patch } }),
          ),
        );
      }
      await assert.rejects(
        state.txA((tx) => tx.fileAssetMutation.delete({ where: { id: clear.id } })),
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.fileAssetMutation.update({
            where: { id: clear.id },
            data: { requestHash: 'd'.repeat(64) },
          }),
        ),
      );
      await assert.rejects(
        state.txA(async (tx) => {
          const replacement = await tx.fileAsset.create({ data: assetData(state) });
          const product = await tx.product.update({
            where: { id: state.catalogA.product.id },
            data: { imageAssetId: replacement.id, version: { increment: 1 } },
          });
          await tx.fileAssetMutation.create({
            data: {
              ...mutationData(state, replacement.id, product.version),
              requestKey: initial.requestKey,
            },
          });
        }),
        /organizationId.*actorUserId.*requestKey/,
      );
      const current = await state.txA((tx) =>
        tx.product.findUniqueOrThrow({ where: { id: state.catalogA.product.id } }),
      );
      assert.equal(current.imageAssetId, null);
      assert.equal(current.version, 3);
    });
    await runFileAssetConcurrencyTests(t, state);
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
