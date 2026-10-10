import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection } from './support/browser-helpers';

test('adresar CRM: creare necunoscută, reload, editare pierdută și retragere fără date persistate', async ({
  browser,
}) => {
  const f = await operationsFixture(browser);
  const page = f.admin;
  try {
    const customer = (
      await (
        await api(page, '/customers', {
          locationId: f.location.id,
          requestKey: randomUUID(),
          name: 'Recuperare adresar',
          phone: '060310132',
        })
      ).json()
    ).customer;
    const open = async () => {
      await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
      await navigateSection(page, 'Clienți');
      await page.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    };
    await open();
    const detail = page.getByRole('dialog', { name: 'Profil client', exact: true });
    const book = detail.getByRole('region', { name: 'Adresele clientului', exact: true });
    const creationPath = `/api/tenant/customers/${customer.id}/addresses`;
    let addressId = '';
    await page.route(`**${creationPath}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      addressId = (await response.json()).address.id;
      await route.abort('failed');
    });
    await book.getByRole('button', { name: 'Adresă nouă', exact: true }).click();
    await book.getByLabel('Etichetă adresă', { exact: true }).fill('Recuperare adresă');
    await book.getByLabel('Adresă completă', { exact: true }).fill('Strada recuperării 131');
    await book.getByRole('button', { name: 'Salvează adresa', exact: true }).click();
    const resolve = book.getByRole('button', {
      name: 'Verifică rezultatul operației',
      exact: true,
    });
    await expect(resolve).toBeEnabled();
    await expect(
      detail.getByRole('button', { name: 'Salvează profilul', exact: true }),
    ).toBeDisabled();
    await expect(
      detail.getByRole('button', { name: 'Închide profilul', exact: true }),
    ).toBeDisabled();
    const storage = await page.evaluate(() => JSON.stringify(Object.entries(sessionStorage)));
    expect(storage).not.toContain('Strada recuperării');
    expect(storage).not.toContain('Recuperare adresă');
    await page.unroute(`**${creationPath}`);
    await page.reload();
    await open();
    await expect(resolve).toBeEnabled();
    await resolve.click();
    const card = book.getByRole('article', { name: 'Recuperare adresă', exact: true });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: 'Editează adresa', exact: true })).toBeEnabled();
    const path = `${creationPath}/${addressId}/commands`;
    await page.route(`**${path}`, async (route) => {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await card.getByRole('button', { name: 'Editează adresa', exact: true }).click();
    await book.getByLabel('Adresă completă', { exact: true }).fill('Destinație actualizată');
    await book.getByRole('button', { name: 'Salvează adresa', exact: true }).click();
    await expect(resolve).toBeEnabled();
    await page.unroute(`**${path}`);
    await page.reload();
    await open();
    await resolve.click();
    await expect(card.getByText('Destinație actualizată', { exact: true })).toBeVisible();
    await page.route(`**${path}`, async (route) => {
      await route.abort('failed');
    });
    await card.getByRole('button', { name: 'Alege ca adresă implicită', exact: true }).click();
    await expect(resolve).toBeEnabled();
    await page.unroute(`**${path}`);
    await resolve.click();
    await expect(
      book.getByText('Tentativa a fost retrasă definitiv. Poți începe explicit o operație nouă.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(card.getByText('Adresă implicită', { exact: true })).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});
