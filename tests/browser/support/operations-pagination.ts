import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { api, navigateSection, noOverflow } from './browser-helpers';

export async function verifyProductPagination(page: Page, locationId: string) {
  // Enough synthetic entries to exercise the second page inside the open editor.
  for (let index = 0; index < 100; index++) {
    const created = await api(page, '/catalog/products', {
      locationId,
      name: `Produs paginare ${String(index).padStart(2, '0')}`,
      sku: `PAGE-${index}`,
      price: '1.00',
    });
    expect(created.status()).toBe(200);
  }
  const first = await (await api(page, `/catalog?locationId=${locationId}`)).json();
  const second = await (
    await api(page, `/catalog?locationId=${locationId}&cursor=${first.nextCursor}`)
  ).json();
  expect(first.products).toHaveLength(50);
  expect(second.products).toHaveLength(50);
  const third = await (
    await api(page, `/catalog?locationId=${locationId}&cursor=${second.nextCursor}`)
  ).json();
  expect(third.products).toHaveLength(1);
  await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(locationId);
  await navigateSection(page, 'Comenzi');
  await page.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
  const draft = page.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
  await draft.getByLabel('Masa', { exact: true }).fill('42');
  await draft.getByRole('button', { name: new RegExp(first.products[0].name) }).click();
  const pattern = '**/api/tenant/catalog?*';
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Pagina suplimentară este temporar indisponibilă' }),
    }),
  );
  await draft.getByRole('button', { name: /Încarcă mai multe/ }).click();
  await expect(draft.getByText('Pagina suplimentară este temporar indisponibilă')).toBeVisible();
  await expect(draft.getByRole('button', { name: /Încarcă mai multe/ })).toBeEnabled();
  await page.unroute(pattern);
  await draft.getByRole('button', { name: /Încarcă mai multe/ }).click();
  const productButtons = draft.locator('.order-product-options').getByRole('button');
  await expect(productButtons).toHaveCount(100);
  await expect(draft.getByRole('button', { name: /Încarcă mai multe/ })).toBeEnabled();
  await draft.getByRole('button', { name: new RegExp(second.products[0].name) }).click();
  await expect(draft.getByLabel('Masa', { exact: true })).toHaveValue('42');
  await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveCount(2);
  await draft.getByRole('button', { name: /Încarcă mai multe/ }).click();
  await expect(productButtons).toHaveCount(101);
  await expect(draft.getByRole('button', { name: /Încarcă mai multe/ })).toHaveCount(0);
  await expect(draft.getByLabel('Masa', { exact: true })).toHaveValue('42');
  await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveCount(2);
  await noOverflow(page);
  await draft.getByRole('button', { name: 'Renunță la modificări' }).click();
  await expect(draft).not.toBeVisible();
  await expect(page.getByText('Pagina suplimentară este temporar indisponibilă')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Comandă nouă', exact: true })).toBeEnabled();
}
