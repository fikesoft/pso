import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations, prepareOperations } from './api/operations-setup';
import type { OperationsFixture } from './api/operations.types';
import { activate, BrowserSession } from './api/support/harness';

let fixture: OperationsFixture;
beforeAll(async () => {
  fixture = await prepareOperations();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

it('ordonează categoriile și cere administrare globală pentru arhivare și vizualizare completă', async () => {
  const { a, b, manager, worker, category, otherLocation } = fixture;
  const later = (
    await a.primary.expect('/catalog/categories', 'POST', { name: 'Deserturi', sortOrder: 9 })
  ).category;
  expect(later.sortOrder).toBe(9);
  const earlier = (
    await a.primary.expect('/catalog/categories', 'POST', { name: 'Aperitive', sortOrder: 2 })
  ).category;
  expect((await a.primary.call('/catalog/categories', 'POST', { name: 'Aperitive' })).status).toBe(
    409,
  );
  expect(
    (await a.primary.call('/catalog/categories', 'POST', { name: 'Invalid', sortOrder: -1 }))
      .status,
  ).toBe(400);
  expect(
    (await a.primary.call('/catalog/categories', 'POST', { name: 'Invalid', sortOrder: 100_001 }))
      .status,
  ).toBe(400);
  const moved = (
    await a.primary.expect(`/catalog/categories/${category.id}`, 'PATCH', {
      version: category.version,
      sortOrder: 5,
    })
  ).category;
  expect(moved.sortOrder).toBe(5);
  expect(
    (
      await a.primary.call(`/catalog/categories/${category.id}`, 'PATCH', {
        version: category.version,
        name: 'Versiune veche',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await manager.call(`/catalog/categories/${earlier.id}`, 'PATCH', {
        version: earlier.version,
        name: 'Local interzis',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await b.primary.call(`/catalog/categories/${earlier.id}`, 'PATCH', {
        version: earlier.version,
        name: 'Altă companie',
      })
    ).status,
  ).toBe(404);
  const url = `/catalog?locationId=${a.location.id}`;
  const categories = (await a.primary.expect(url)).categories;
  expect(categories.map((item: { id: string }) => item.id).slice(0, 3)).toEqual([
    earlier.id,
    moved.id,
    later.id,
  ]);
  expect((await worker.call(`${url}&includeArchived=true`)).status).toBe(403);
  expect((await manager.call(`${url}&includeArchived=true`)).status).toBe(403);
  expect(
    (await a.primary.call(`/catalog?locationId=${otherLocation.id}&includeArchived=true`)).status,
  ).toBe(200);
  expect((await b.primary.call(`${url}&includeArchived=true`)).status).toBe(403);
});

it('arhivează produsele înaintea categoriei și păstrează snapshoturile comenzilor existente', async () => {
  const { a, b, category, product, worker, manager } = fixture;
  const productUrl = `/catalog/products/${product.id}?locationId=${a.location.id}`;
  expect((await worker.expect(productUrl)).product).toMatchObject({
    id: product.id,
    status: 'ACTIVE',
    price: '10.0050',
  });
  expect(
    (await worker.call(`/catalog/products/${product.id}?locationId=${b.location.id}`)).status,
  ).toBe(403);
  expect(
    (await b.primary.call(`/catalog/products/${product.id}?locationId=${b.location.id}`)).status,
  ).toBe(404);
  const activeCategory = (
    await a.primary.expect(`/catalog?locationId=${a.location.id}`)
  ).categories.find((item: { id: string }) => item.id === category.id);
  const foreignCategory = (
    await b.primary.expect('/catalog/categories', 'POST', { name: 'Categorie străină' })
  ).category;
  const order = (
    await worker.expect(
      '/orders',
      'POST',
      fixture.draft({ items: [{ productId: product.id, quantity: '1' }] }),
    )
  ).order;
  expect(order.items[0].productName).toBe(product.name);
  expect(
    (
      await a.primary.call(`/catalog/categories/${category.id}`, 'PATCH', {
        version: activeCategory.version,
        status: 'ARCHIVED',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await a.primary.call('/catalog/products', 'POST', {
        locationId: a.location.id,
        categoryId: foreignCategory.id,
        name: 'Categorie străină',
        sku: 'FOREIGN-CAT',
        price: '1.0000',
      })
    ).status,
  ).toBe(404);
  const archived = (
    await a.primary.expect(`/catalog/products/${product.id}`, 'PATCH', {
      version: product.version,
      status: 'ARCHIVED',
    })
  ).product;
  expect(archived.status).toBe('ARCHIVED');
  expect((await a.primary.expect(productUrl)).product.status).toBe('ARCHIVED');
  expect((await worker.call(productUrl)).status).toBe(403);
  expect((await manager.call(productUrl)).status).toBe(403);
  const archivedCategory = (
    await a.primary.expect(`/catalog/categories/${category.id}`, 'PATCH', {
      version: activeCategory.version,
      status: 'ARCHIVED',
    })
  ).category;
  expect(archivedCategory.status).toBe('ARCHIVED');
  const url = `/catalog?locationId=${a.location.id}`;
  const current = await a.primary.expect(url);
  expect(current.categories.some((item: { id: string }) => item.id === category.id)).toBe(false);
  expect(current.products.some((item: { id: string }) => item.id === product.id)).toBe(false);
  const full = await a.primary.expect(`${url}&includeArchived=true`);
  expect(full.categories.find((item: { id: string }) => item.id === category.id)?.status).toBe(
    'ARCHIVED',
  );
  expect(full.products.find((item: { id: string }) => item.id === product.id)?.status).toBe(
    'ARCHIVED',
  );
  expect(
    (
      await a.primary.call('/catalog/products', 'POST', {
        locationId: a.location.id,
        categoryId: category.id,
        name: 'Produs nou interzis',
        sku: 'NO-CAT',
        price: '1.0000',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await a.primary.call(`/catalog/products/${product.id}`, 'PATCH', {
        version: archived.version,
        status: 'ACTIVE',
      })
    ).status,
  ).toBe(409);
  const edited = (
    await a.primary.expect(`/catalog/products/${product.id}`, 'PATCH', {
      version: archived.version,
      name: product.name,
      sku: product.sku,
      description: 'Descriere păstrată în arhivă',
      categoryId: category.id,
      status: 'ARCHIVED',
    })
  ).product;
  expect(edited.description).toBe('Descriere păstrată în arhivă');
  expect(
    (
      await worker.call(
        '/orders',
        'POST',
        fixture.draft({ items: [{ productId: product.id, quantity: '1' }] }),
      )
    ).status,
  ).toBe(409);
  expect((await worker.expect(`/orders/${order.id}`)).order.items[0]).toMatchObject({
    productName: product.name,
    unitPrice: '10.0050',
  });
  await a.primary.expect(`/catalog/categories/${category.id}`, 'PATCH', {
    version: archivedCategory.version,
    status: 'ACTIVE',
  });
  expect(
    (
      await a.primary.expect(`/catalog/products/${product.id}`, 'PATCH', {
        version: edited.version,
        status: 'ACTIVE',
      })
    ).product.status,
  ).toBe('ACTIVE');
  const role = (
    await a.primary.expect('/roles', 'POST', {
      name: 'Doar administrare catalog local',
      permissions: [{ permission: 'catalog.manage' }],
    })
  ).role;
  const staff = await a.primary.expect('/staff', 'POST', {
    login: 'catalog-manage-only',
    displayName: 'Catalog local sintetic',
    locationIds: [a.location.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: a.location.id },
    ],
  });
  const manageOnly = new BrowserSession('TENANT');
  await activate(
    manageOnly,
    'catalog-manage-only',
    staff.temporaryPassword,
    a.company.organization.slug,
  );
  expect(
    (await manageOnly.expect(url)).products.some((item: { id: string }) => item.id === product.id),
  ).toBe(true);
  expect((await manageOnly.call(`${url}&includeArchived=true`)).status).toBe(403);
});
