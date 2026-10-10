import { randomUUID } from 'node:crypto';
import { prepareOrderSearch } from './order-search-setup';
import { db } from './support/harness';

export async function prepareCatalogSearch() {
  const f = await prepareOrderSearch();
  const category = (
    await f.a.primary.expect('/catalog/categories', 'POST', { name: 'Categorie căutare' })
  ).category;
  const prefix = randomUUID().slice(0, 24);
  const idAt = (index: number) => `${prefix}${String(index * 10).padStart(12, '0')}`;
  const actorId = (await f.a.primary.expect('/auth/session')).user.id;
  const seed = async (id: string, name: string, sku: string, categoryId?: string) =>
    db.withTenantTransaction(
      db.runtime,
      { organizationId: f.a.company.organization.id, userId: actorId },
      (tx) =>
        tx.product.create({
          data: {
            id,
            organizationId: f.a.company.organization.id,
            categoryId,
            name,
            sku,
            createdByUserId: actorId,
          },
        }),
    );
  await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id, userId: actorId },
    (tx) =>
      tx.product.createMany({
        data: Array.from({ length: 220 }, (_, index) => ({
          id: idAt(index),
          organizationId: f.a.company.organization.id,
          categoryId: f.category.id,
          name: index < 10 ? `PageMarker ${index}` : `Produs căutare ${index}`,
          sku: `SEARCH-${index}`,
          createdByUserId: actorId,
        })),
      }),
  );
  const changes = [
    { id: idAt(210), name: 'Șnițel Căutare 100%_\\literal', sku: 'nEeDlE-210' },
    { id: idAt(211), name: 'Altă denumire', sku: 'NEEDLE-211', categoryId: category.id },
    { id: idAt(212), name: 'Needle Dezactivat', sku: 'NEEDLE-212' },
    { id: idAt(213), name: 'Needle Arhivat', sku: 'NEEDLE-213', status: 'ARCHIVED' },
  ];
  for (const { id, ...body } of changes)
    await f.a.primary.expect(`/catalog/products/${id}`, 'PATCH', { ...body, version: 1 });
  for (const [index, enabled] of [
    [210, true],
    [212, false],
  ] as const)
    await f.a.primary.expect(
      `/catalog/products/${idAt(index)}/locations/${f.a.location.id}`,
      'PUT',
      { price: '7.5000', enabled },
    );
  const foreignCategory = (
    await f.b.primary.expect('/catalog/categories', 'POST', { name: 'Categorie străină' })
  ).category;
  const foreign = (
    await f.b.primary.expect('/catalog/products', 'POST', {
      locationId: f.b.location.id,
      categoryId: foreignCategory.id,
      name: 'Needle străin',
      sku: 'FOREIGN-NEEDLE',
      price: '999',
    })
  ).product;
  return { ...f, searchCategory: category, idAt, prefix, seed, foreign, foreignCategory };
}
