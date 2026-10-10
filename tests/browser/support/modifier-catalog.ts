import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { api, navigateSection, submit } from './browser-helpers';

export async function configureProductModifiers(page: Page, locationId: string) {
  await navigateSection(page, 'Catalog');
  await page.getByRole('button', { name: 'Modificatori', exact: true }).click();
  await page.getByRole('button', { name: 'Grup nou', exact: true }).click();
  const groupForm = page.getByRole('dialog', { name: 'Grup nou', exact: true });
  await groupForm.getByLabel('Numele grupului').fill('Lapte sintetic');
  await groupForm.getByLabel('Minimum de alegeri').fill('1');
  await groupForm.getByLabel('Maximum de alegeri').fill('1');
  const group = (
    await submit(
      page,
      '/api/tenant/catalog/modifier-groups',
      groupForm.getByRole('button', { name: 'Salvează grupul' }),
    )
  ).modifierGroup;
  await expect(groupForm).not.toBeVisible();
  await page.getByRole('button', { name: 'Gestionează opțiunile' }).click();
  await page.getByRole('button', { name: 'Opțiune nouă', exact: true }).click();
  const optionForm = page.getByRole('dialog', { name: 'Opțiune nouă', exact: true });
  await optionForm.getByLabel('Numele opțiunii').fill('Ovăz sintetic');
  await optionForm.getByLabel('Preț suplimentar (MDL)').fill('1.0050');
  const option = (
    await submit(
      page,
      `/api/tenant/catalog/modifier-groups/${group.id}/options`,
      optionForm.getByRole('button', { name: 'Salvează opțiunea' }),
    )
  ).modifierOption;
  await expect(optionForm).not.toBeVisible();
  const productResponse = await api(page, '/catalog/products', {
    name: 'Cafea personalizabilă',
    sku: 'MOD-E2E',
    locationId,
    price: '10.0000',
  });
  expect(productResponse.status()).toBe(200);
  const { product } = await productResponse.json();
  await page.getByRole('button', { name: 'Produse și categorii' }).click();
  await page
    .locator('article')
    .filter({
      has: page.getByRole('heading', {
        name: product.name,
        exact: true,
      }),
    })
    .getByRole('button', { name: 'Editează', exact: true })
    .click();
  const productForm = page.getByRole('dialog', { name: 'Editează produsul', exact: true });
  const bindings = productForm.getByRole('region', { name: 'Modificatorii produsului' });
  await bindings.getByLabel('Alege grupul').selectOption(group.id);
  await submit(
    page,
    `/api/tenant/catalog/products/${product.id}/modifier-groups`,
    bindings.getByRole('button', { name: 'Asociază grupul' }),
  );
  await expect(bindings).toContainText('Ovăz sintetic · +1.0050 MDL');
  await bindings.getByRole('button', { name: 'Rețeta opțiunii' }).click();
  const recipe = page.getByRole('dialog', { name: 'Rețeta opțiunii', exact: true });
  await expect(recipe.getByText(/Configurare consum: Neconfigurat/)).toBeVisible();
  await recipe.getByLabel('Motivul versiunii').fill('Exemplu sintetic fără efect pe stoc');
  await recipe.getByRole('button', { name: 'Salvează versiunea rețetei' }).click();
  await expect(
    recipe
      .getByText('Confirm că această opțiune nu modifică stocul pentru produsul ales.', {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await recipe.getByRole('checkbox').check();
  await recipe.getByRole('button', { name: 'Adaugă componentă', exact: true }).click();
  await recipe.getByRole('button', { name: 'Elimină componenta', exact: true }).click();
  await expect(recipe.getByRole('checkbox')).not.toBeChecked();
  await recipe.getByRole('checkbox').check();
  const published = await submit(
    page,
    `/api/tenant/inventory/modifier-recipes/${product.id}/${option.id}`,
    recipe.getByRole('button', { name: 'Salvează versiunea rețetei' }),
  );
  expect(published.recipe.version).toBe(1);
  await expect(recipe).not.toBeVisible();
  await productForm.getByRole('button', { name: 'Anulează', exact: true }).click();
  await expect(productForm).not.toBeVisible();
  return { product, group, option };
}

export async function changeModifierWithStaleRecovery(
  page: Page,
  groupId: string,
  optionId: string,
  locationId: string,
) {
  await navigateSection(page, 'Catalog');
  await page.getByRole('button', { name: 'Modificatori', exact: true }).click();
  await page.getByRole('button', { name: 'Gestionează opțiunile' }).click();
  await page.getByRole('button', { name: 'Editează opțiunea', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Editează opțiunea', exact: true });
  const path = `/catalog/modifier-groups/${groupId}/options/${optionId}`;
  const current = await (await api(page, `${path}?locationId=${locationId}`)).json();
  const changed = await api(
    page,
    path,
    {
      version: current.modifierOption.version,
      name: 'Ovăz actualizat',
      extraPrice: '3.0000',
    },
    'PATCH',
  );
  expect(changed.status()).toBe(200);
  const rejected = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/tenant${path}` &&
      response.request().method() === 'PATCH',
  );
  await form.getByRole('button', { name: 'Salvează opțiunea' }).click();
  expect((await rejected).status()).toBe(409);
  await form.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
  await expect(form.getByLabel('Numele opțiunii')).toHaveValue('Ovăz actualizat');
  await expect(form.getByLabel('Preț suplimentar (MDL)')).toHaveValue('3.0000');
  await form.getByRole('button', { name: 'Anulează', exact: true }).click();
}

export async function recoverStaleOrderModifiers(
  page: Page,
  draft: Locator,
  groupId: string,
  optionId: string,
  optionVersion: number,
) {
  const changed = await api(
    page,
    `/catalog/modifier-groups/${groupId}/options/${optionId}`,
    {
      version: optionVersion,
      extraPrice: '1.0050',
    },
    'PATCH',
  );
  expect(changed.status()).toBe(200);
  const rejected = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/tenant/orders' &&
      response.request().method() === 'POST',
  );
  await draft.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
  const response = await rejected;
  expect(response.status()).toBe(409);
  expect((await response.json()).code).toBe('MODIFIER_CONFIGURATION_STALE');
  await expect(draft.getByRole('button', { name: 'Salvează ciorna', exact: true })).toBeDisabled();
  await draft.getByRole('button', { name: 'Reîncarcă · Catalog', exact: true }).click();
  await draft.getByRole('button', { name: 'Elimină', exact: true }).click();
  await draft.getByRole('button', { name: /Cafea personalizabilă/ }).click();
  const picker = draft.getByRole('region', { name: 'Alege opțiunile', exact: true });
  await picker.getByRole('checkbox', { name: /Ovăz sintetic/ }).check();
  await picker.getByRole('button', { name: 'Adaugă produsul', exact: true }).click();
}
