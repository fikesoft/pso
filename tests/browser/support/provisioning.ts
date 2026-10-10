import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { submit } from './browser-helpers';
import type { SyntheticAccount } from './account.types';
export async function createCompany(
  page: Page,
  slug: string,
  name: string,
  account: SyntheticAccount,
) {
  await page.getByRole('button', { name: 'Adaugă companie' }).click();
  const dialog = page.getByRole('dialog', { name: 'Creează o companie' });
  await dialog.getByLabel('Nume comercial', { exact: true }).fill(name);
  await dialog.getByLabel('Identificator companie').fill(slug);
  await dialog
    .getByLabel('Numele administratorului', { exact: true })
    .fill('Administrator Sintetic');
  await dialog.getByLabel('Login administrator', { exact: true }).fill(account.login);
  await dialog.getByLabel('Parolă temporară (opțional)').fill(account.initialPassword);
  const data = await submit(
    page,
    '/api/platform/organizations',
    dialog.getByRole('button', { name: 'Creează compania și administratorul' }),
  );
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Am salvat parola în siguranță' }).click();
  return data.organization as { id: string; primaryAdminUserId: string };
}
export async function createLocation(page: Page, name: string, code: string) {
  await page.getByRole('button', { name: 'Adaugă locație' }).click();
  const dialog = page.getByRole('dialog', { name: 'Locație nouă' });
  await dialog.getByLabel('Denumire locație').fill(name);
  await dialog.getByLabel('Cod intern').fill(code);
  const data = await submit(
    page,
    '/api/tenant/locations',
    dialog.getByRole('button', { name: 'Creează locația' }),
  );
  await expect(dialog).not.toBeVisible();
  return data.location as { id: string; name: string };
}
export async function createRole(page: Page, name: string, labels: string[]) {
  await page.getByRole('button', { name: 'Creează rol', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Creează un rol' });
  await dialog.getByLabel('Numele rolului').fill(name);
  for (const label of labels)
    await dialog.getByRole('checkbox', { name: label, exact: true }).check();
  const data = await submit(
    page,
    '/api/tenant/roles',
    dialog.getByRole('button', { name: 'Creează rolul', exact: true }),
  );
  await expect(dialog).not.toBeVisible();
  return data.role as { id: string; versions: { id: string }[] };
}
export async function createStaff(
  page: Page,
  account: SyntheticAccount,
  name: string,
  role: string,
  locationName: string,
) {
  await page.getByRole('button', { name: 'Adaugă persoană' }).click();
  const dialog = page.getByRole('dialog', { name: 'Adaugă în echipă' });
  await dialog.getByLabel('Numele persoanei').fill(name);
  await dialog.getByLabel('Login individual').fill(account.login);
  await dialog.getByLabel('Metodă de autentificare').selectOption('PASSWORD');
  await dialog.getByLabel('Parolă temporară (opțional)').fill(account.initialPassword);
  await dialog.getByRole('checkbox', { name: new RegExp(locationName) }).check();
  await dialog.getByLabel('Rol inițial').selectOption({ label: `${role} · v1` });
  await expect(
    dialog.getByRole('combobox', { name: 'Locație', exact: true }).locator('option:checked'),
  ).toHaveText(locationName);
  await dialog.getByRole('button', { name: 'Previzualizează accesul' }).click();
  await expect(dialog.getByRole('button', { name: 'Creează contul' })).toBeEnabled();
  const data = await submit(
    page,
    '/api/tenant/staff',
    dialog.getByRole('button', { name: 'Creează contul' }),
  );
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Am salvat parola în siguranță' }).click();
  return data.user as { id: string; version: number };
}
