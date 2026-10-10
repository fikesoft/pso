import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { catalogProductIdsQuery } from '../../../apps/api/src/features/catalog/model/catalog-search-filter';
import { createOperationsFixture } from './fixtures/operations.fixture';

test('PostgreSQL real: căutarea literală filtrează întregul catalog înainte de paginare, sub RLS', async (t) => {
  const f = await createOperationsFixture();
  const prefix = randomUUID().slice(0, 24);
  const idAt = (index: number) => `${prefix}${index.toString().padStart(12, '0')}`;
  try {
    const otherCategory = await f.txA((tx) =>
      tx.category.create({
        data: { organizationId: f.a.organization.id, name: 'Categorie alternativă' },
      }),
    );
    for (let batch = 0; batch < 10; batch++)
      await f.txA((tx) =>
        tx.product.createMany({
          data: Array.from({ length: 1000 }, (_, offset) => {
            const index = batch * 1000 + offset;
            return {
              id: idAt(index),
              organizationId: f.a.organization.id,
              categoryId: index % 100 === 0 ? f.catalogA.category.id : otherCategory.id,
              name: `Produs benchmark ${String(index).padStart(5, '0')}`,
              sku: `BENCH-${index}`,
              createdByUserId: f.a.user.id,
            };
          }),
        }),
      );
    const target = await f.txA((tx) =>
      tx.product.update({
        where: { id: idAt(9900) },
        data: {
          name: 'Șnițel Needle 100%_\\literal',
          sku: 'CASE-Needle-SKU',
          version: { increment: 1 },
        },
      }),
    );
    const skuOnly = await f.txA((tx) =>
      tx.product.update({
        where: { id: idAt(9901) },
        data: { sku: 'ONLY-NEEDLE-CODE', version: { increment: 1 } },
      }),
    );
    await f.txB((tx) =>
      tx.product.update({
        where: { id: f.catalogB.product.id },
        data: { name: 'Foreign Needle', version: { increment: 1 } },
      }),
    );
    const search = (q: string, categoryId?: string, after?: string) =>
      f.txA((tx) =>
        tx.$queryRaw<Array<{ id: string }>>(
          catalogProductIdsQuery(
            f.a.organization.id,
            { locationId: f.locationA.id, q, categoryId, limit: 1 },
            after,
          ),
        ),
      );
    await t.test(
      'găsește nume și SKU dincolo de primele pagini și aplică categoria cu AND',
      async () => {
        assert.equal((await search('nEeDlE'))[0]?.id, target.id);
        assert.equal((await search('needle', undefined, target.id))[0]?.id, skuOnly.id);
        assert.equal((await search('needle', f.catalogA.category.id))[0]?.id, target.id);
        assert.equal((await search('needle', otherCategory.id))[0]?.id, skuOnly.id);
        assert.equal((await search('foreign')).length, 0);
      },
    );
    await t.test('tratează metacaracterele ca text și nu elimină diacriticele', async () => {
      for (const q of ['%', '_', '\\literal', '%_\\'])
        assert.equal((await search(q))[0]?.id, target.id);
      assert.equal((await search('ȘNIȚEL'))[0]?.id, target.id);
      assert.equal((await search('Snitel')).length, 0);
      assert.equal((await search("' OR 1=1 --")).length, 0);
      assert.equal(await f.runtime.product.count({ where: { id: target.id } }), 0);
      assert.equal(await f.txB((tx) => tx.product.count({ where: { id: target.id } })), 0);
    });
    await t.test(
      'înregistrează planuri reale sub rolul runtime fără owner sau BYPASSRLS',
      async () => {
        const evidence = await f.txA(async (tx) => {
          const [role] = await tx.$queryRaw<
            Array<{ name: string; superuser: boolean; bypass: boolean; forced: boolean }>
          >`
          SELECT current_user AS name,r.rolsuper AS superuser,r.rolbypassrls AS bypass,c.relforcerowsecurity AS forced
          FROM pg_roles r CROSS JOIN pg_class c WHERE r.rolname=current_user AND c.oid='"Product"'::regclass`;
          assert.deepEqual(
            { superuser: role!.superuser, bypass: role!.bypass, forced: role!.forced },
            { superuser: false, bypass: false, forced: true },
          );
          const measurements = [];
          for (const term of ['needle', 'no-match-at-all', 'produs', 'x', 'ȘNIȚEL']) {
            const query = catalogProductIdsQuery(f.a.organization.id, {
              locationId: f.locationA.id,
              q: term,
            });
            const plan = await tx.$queryRaw`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query}`;
            measurements.push({ term, plan });
          }
          const categoryQuery = catalogProductIdsQuery(f.a.organization.id, {
            locationId: f.locationA.id,
            q: 'needle',
            categoryId: f.catalogA.category.id,
          });
          const category =
            await tx.$queryRaw`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${categoryQuery}`;
          const collation =
            await tx.$queryRaw`SELECT collname,collprovider::text AS provider,collversion,collisdeterministic,pg_collation_actual_version(oid) AS actual_version FROM pg_collation WHERE collname='pos_catalog_search'`;
          return {
            measuredAt: new Date().toISOString(),
            syntheticTenantProducts: 10001,
            role,
            collation,
            measurements,
            category,
          };
        });
        await mkdir('.local/horeca-product-search-verification', { recursive: true });
        await writeFile(
          '.local/horeca-product-search-verification/runtime-query-plans.json',
          JSON.stringify(evidence, null, 2),
        );
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
