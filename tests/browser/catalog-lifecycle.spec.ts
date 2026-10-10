import { randomUUID } from 'node:crypto';
import type {
  CatalogCategory,
  CatalogResponse,
  CatalogProduct,
  OrderResponse,
} from '../../packages/contracts/src';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

async function catalog(page: Page, locationId: string, includeArchived = false) {
  const query = includeArchived ? '&includeArchived=true' : '';
  const response = await api(page, `/catalog?locationId=${locationId}${query}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as CatalogResponse;
}

test('catalog: ordine, concurență, arhivare, istoric și reactivare', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const fixture = await operationsFixture(browser);
  const { admin, location } = fixture;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(admin, 'Catalog');
    await admin.getByRole('button', { name: 'Categorie nouă', exact: true }).click();
    const createCategory = admin.getByRole('dialog', { name: 'Categorie nouă', exact: true });
    await createCategory.getByLabel('Numele categoriei').fill('Băuturi inițiale');
    await createCategory.getByLabel('Ordine în catalog').fill('10');
    const created = await submit(
      admin,
      '/api/tenant/catalog/categories',
      createCategory.getByRole('button', { name: 'Salvează categoria' }),
    );
    const category = created.category as CatalogCategory;
    expect(category).toMatchObject({ name: 'Băuturi inițiale', sortOrder: 10, status: 'ACTIVE' });
    const earlier = await api(admin, '/catalog/categories', {
      name: 'Ceaiuri ordonate',
      sortOrder: 5,
    });
    expect(earlier.status()).toBe(200);
    await admin.getByRole('button', { name: 'Reîncarcă' }).click();
    const region = admin.locator('section[aria-label="Categorii"]');
    await expect(region).toBeVisible();
    const categoryRows = region.getByRole('row');
    await expect(categoryRows.nth(1)).toContainText('Ceaiuri ordonate');
    await expect(categoryRows.nth(2)).toContainText('Băuturi inițiale');
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await region
      .getByRole('row')
      .filter({ hasText: 'Băuturi inițiale' })
      .getByRole('button', { name: 'Editează categoria' })
      .click();
    const editCategory = admin.getByRole('dialog', { name: 'Editează categoria', exact: true });
    await expect(editCategory.getByLabel('Ordine în catalog')).toHaveValue('10');
    await noOverflow(admin);
    await admin.screenshot({
      path: info.outputPath('catalog-category-mobile.png'),
      fullPage: true,
    });
    await editCategory.getByLabel('Numele categoriei').fill('Băuturi finale');
    await editCategory.getByLabel('Ordine în catalog').fill('3');
    const competing = await api(
      admin,
      `/catalog/categories/${category.id}`,
      { version: category.version, name: 'Băuturi concurente' },
      'PATCH',
    );
    expect(competing.status()).toBe(200);
    const conflict = admin.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/tenant/catalog/categories/${category.id}` &&
        response.request().method() === 'PATCH',
    );
    await editCategory.getByRole('button', { name: 'Salvează categoria' }).click();
    expect((await conflict).status()).toBe(409);
    await expect(editCategory.getByText(/Categoria a fost modificată/)).toBeVisible();
    await editCategory.getByRole('button', { name: 'Reîncarcă' }).click();
    await expect(editCategory.getByLabel('Numele categoriei')).toHaveValue('Băuturi concurente');
    await expect(editCategory.getByLabel('Ordine în catalog')).toHaveValue('10');
    await admin.setViewportSize({ width: 1440, height: 900 });
    await editCategory.getByLabel('Numele categoriei').fill('Băuturi finale');
    await editCategory.getByLabel('Ordine în catalog').fill('3');
    await editCategory.getByRole('button', { name: 'Salvează categoria' }).click();
    await expect(editCategory).not.toBeVisible();
    const ordered = await catalog(admin, location.id);
    expect(ordered.categories.map((entry) => entry.name).slice(0, 2)).toEqual([
      'Băuturi finale',
      'Ceaiuri ordonate',
    ]);

    const catalogRequest = (url: URL) =>
      url.pathname === '/api/tenant/catalog' && url.searchParams.has('locationId');
    await admin.route(catalogRequest, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Catalog indisponibil temporar' }),
      }),
    );
    await admin.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await expect(admin.getByText('Catalog indisponibil temporar')).toBeVisible();
    await admin.getByRole('button', { name: 'Produs nou', exact: true }).click();
    const createProduct = admin.getByRole('dialog', { name: 'Produs nou', exact: true });
    await expect(createProduct.getByText('Catalog indisponibil temporar')).toBeVisible();
    await admin.unroute(catalogRequest);
    const recovered = admin.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/tenant/catalog' &&
        response.request().method() === 'GET' &&
        response.status() === 200,
    );
    await createProduct.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await recovered;
    await expect(createProduct.getByText('Catalog indisponibil temporar')).not.toBeVisible();
    await expect(createProduct.getByLabel('Categorie', { exact: true })).toContainText(
      'Băuturi finale',
    );
    await createProduct.getByLabel('Numele produsului').fill('Cafea istorică');
    await createProduct.getByLabel('Cod produs').fill(`CAFEA-${randomUUID().slice(0, 8)}`);
    await createProduct.getByLabel('Categorie', { exact: true }).selectOption(category.id);
    await createProduct.getByLabel('Preț local (MDL)').fill('10.0050');
    const productResult = await submit(
      admin,
      '/api/tenant/catalog/products',
      createProduct.getByRole('button', { name: 'Salvează produsul' }),
    );
    const product = productResult.product as CatalogProduct;
    const orderResponse = await api(admin, '/orders', {
      locationId: location.id,
      serviceType: 'TAKEAWAY',
      items: [{ productId: product.id, quantity: '1' }],
      requestKey: randomUUID(),
    });
    expect(orderResponse.status()).toBe(200);
    const order = ((await orderResponse.json()) as OrderResponse).order;
    expect(order.items[0]).toMatchObject({ productName: 'Cafea istorică', unitPrice: '10.0050' });

    await region
      .getByRole('row')
      .filter({ hasText: 'Băuturi finale' })
      .getByRole('button', { name: 'Editează categoria' })
      .click();
    await editCategory.getByLabel('Stare').selectOption('ARCHIVED');
    const blockedCategory = admin.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/tenant/catalog/categories/${category.id}` &&
        response.request().method() === 'PATCH',
    );
    await editCategory.getByRole('button', { name: 'Salvează categoria' }).click();
    expect((await blockedCategory).status()).toBe(409);
    await expect(editCategory.getByText(/Arhivați produsele active/)).toBeVisible();
    await admin.keyboard.press('Escape');

    await admin
      .locator('article')
      .filter({ has: admin.getByRole('heading', { name: 'Cafea istorică' }) })
      .getByRole('button', { name: 'Editează', exact: true })
      .click();
    const editProduct = admin.getByRole('dialog', { name: 'Editează produsul', exact: true });
    await editProduct.getByLabel('Numele produsului').fill('Cafea redenumită');
    await editProduct.getByLabel('Stare').selectOption('ARCHIVED');
    await editProduct.getByRole('button', { name: 'Salvează datele comune' }).click();
    await expect(editProduct).not.toBeVisible();
    const publicArchive = await catalog(admin, location.id);
    expect(publicArchive.products.some((entry) => entry.id === product.id)).toBe(false);
    const adminArchive = await catalog(admin, location.id, true);
    expect(adminArchive.products.find((entry) => entry.id === product.id)).toMatchObject({
      name: 'Cafea redenumită',
      status: 'ARCHIVED',
    });
    expect((await (await api(admin, `/orders/${order.id}`)).json()).order.items[0]).toMatchObject({
      productName: 'Cafea istorică',
      unitPrice: '10.0050',
    });

    await region
      .getByRole('row')
      .filter({ hasText: 'Băuturi finale' })
      .getByRole('button', { name: 'Editează categoria' })
      .click();
    await editCategory.getByLabel('Stare').selectOption('ARCHIVED');
    await editCategory.getByRole('button', { name: 'Salvează categoria' }).click();
    await expect(editCategory).not.toBeVisible();
    expect(
      (await catalog(admin, location.id)).categories.some((entry) => entry.id === category.id),
    ).toBe(false);
    expect(
      (await catalog(admin, location.id, true)).categories.find(
        (entry) => entry.id === category.id,
      ),
    ).toMatchObject({ status: 'ARCHIVED' });

    await admin
      .locator('article')
      .filter({ has: admin.getByRole('heading', { name: 'Cafea redenumită' }) })
      .getByRole('button', { name: 'Editează', exact: true })
      .click();
    await editProduct.getByLabel('Stare').selectOption('ACTIVE');
    const blockedProduct = admin.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/tenant/catalog/products/${product.id}` &&
        response.request().method() === 'PATCH',
    );
    await editProduct.getByRole('button', { name: 'Salvează datele comune' }).click();
    expect((await blockedProduct).status()).toBe(409);
    await expect(editProduct.getByText(/Categoria este arhivată/)).toBeVisible();
    await admin.keyboard.press('Escape');
    await region
      .getByRole('row')
      .filter({ hasText: 'Băuturi finale' })
      .getByRole('button', { name: 'Editează categoria' })
      .click();
    await editCategory.getByLabel('Stare').selectOption('ACTIVE');
    await editCategory.getByRole('button', { name: 'Salvează categoria' }).click();
    await expect(editCategory).not.toBeVisible();
    await admin
      .locator('article')
      .filter({ has: admin.getByRole('heading', { name: 'Cafea redenumită' }) })
      .getByRole('button', { name: 'Editează', exact: true })
      .click();
    await editProduct.getByLabel('Stare').selectOption('ACTIVE');
    await editProduct.getByRole('button', { name: 'Salvează datele comune' }).click();
    await expect(editProduct).not.toBeVisible();
    const restored = await catalog(admin, location.id);
    expect(restored.categories.filter((entry) => entry.id === category.id)).toHaveLength(1);
    expect(restored.products.filter((entry) => entry.id === product.id)).toHaveLength(1);
  } finally {
    await fixture.dispose();
  }
});
