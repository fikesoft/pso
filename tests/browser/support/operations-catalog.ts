import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { navigateSection, submit } from './browser-helpers';

export async function createOperationalProduct(page: Page) {
  await navigateSection(page, 'Catalog');
  await page.getByRole('button', { name: 'Categorie nouă', exact: true }).click();
  const category = page.getByRole('dialog', { name: 'Categorie nouă', exact: true });
  await category.getByLabel('Numele categoriei').fill('Băuturi sintetice');
  await submit(
    page,
    '/api/tenant/catalog/categories',
    category.getByRole('button', { name: 'Salvează categoria' }),
  );
  await expect(category).not.toBeVisible();
  await page.getByRole('button', { name: 'Produs nou', exact: true }).click();
  const product = page.getByRole('dialog', { name: 'Produs nou', exact: true });
  await product.getByLabel('Numele produsului').fill('Cafea sintetică');
  await product.getByLabel('Cod produs').fill('CAFEA-E2E');
  await product
    .getByLabel('Categorie', { exact: true })
    .selectOption({ label: 'Băuturi sintetice' });
  await product.getByLabel('Preț local (MDL)').fill('10.0050');
  const result = await submit(
    page,
    '/api/tenant/catalog/products',
    product.getByRole('button', { name: 'Salvează produsul' }),
  );
  await expect(product).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cafea sintetică', exact: true })).toBeVisible();
  return result.product as { id: string };
}

export async function changeOperationalPrice(page: Page, productId: string, locationId: string) {
  await navigateSection(page, 'Catalog');
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Cafea sintetică', exact: true }) })
    .getByRole('button', { name: 'Editează', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Editează produsul', exact: true });
  await dialog.getByLabel('Preț local (MDL)').fill('20.0000');
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/tenant/catalog/products/${productId}/locations/${locationId}` &&
      response.request().method() === 'PUT',
  );
  await dialog.getByRole('button', { name: 'Salvează setările locale' }).click();
  expect((await saved).status()).toBe(200);
  await expect(dialog).not.toBeVisible();
}
