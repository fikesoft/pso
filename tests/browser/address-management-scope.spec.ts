import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection } from './support/browser-helpers';

test('adresar CRM context: paginare și recuperare izolată pe client și locație', async ({
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
          name: 'Paginare adresar',
          phone: '060310134',
        })
      ).json()
    ).customer;
    await api(page, '/customers', {
      locationId: f.location.id,
      requestKey: randomUUID(),
      name: 'Alt client adresar',
      phone: '060310135',
    });
    for (let index = 0; index < 21; index++)
      expect(
        (
          await api(page, `/customers/${customer.id}/addresses`, {
            locationId: f.location.id,
            requestKey: randomUUID(),
            label: `Adresă ${index}`,
            address: `Strada paginare ${index}`,
          })
        ).status(),
      ).toBe(200);
    const open = async (name: string) =>
      page
        .getByRole('row')
        .filter({ hasText: name })
        .getByRole('button', { name: 'Deschide profilul', exact: true })
        .click();
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Clienți');
    await open('Paginare adresar');
    const detail = page.getByRole('dialog', { name: 'Profil client', exact: true });
    const book = detail.getByRole('region', { name: 'Adresele clientului', exact: true });
    await expect(book.getByRole('article')).toHaveCount(20);
    await book.getByRole('button', { name: 'Încarcă mai multe adrese', exact: true }).click();
    await expect(book.getByRole('article')).toHaveCount(21);
    const labels = await book
      .getByRole('article')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));
    expect(new Set(labels).size).toBe(21);
    await page.route('**/addresses/*/commands', async (route) => {
      await route.abort('failed');
    });
    const card = book.getByRole('article').first();
    await card.getByRole('button', { name: 'Arhivează adresa', exact: true }).click();
    await card.getByRole('button', { name: 'Confirmă arhivarea adresei', exact: true }).click();
    const resolve = book.getByRole('button', {
      name: 'Verifică rezultatul operației',
      exact: true,
    });
    await expect(resolve).toBeEnabled();
    const pending = await page.evaluate(() =>
      Object.entries(sessionStorage).find(([key]) => key.startsWith('pos.address-book:')),
    );
    expect(pending).toBeTruthy();
    await page.unroute('**/addresses/*/commands');
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.otherLocation.id);
    await navigateSection(page, 'Clienți');
    await open('Paginare adresar');
    await expect(book.getByRole('button', { name: 'Adresă nouă', exact: true })).toBeEnabled();
    await expect(resolve).toHaveCount(0);
    await detail.getByRole('button', { name: 'Închide profilul', exact: true }).click();
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await open('Alt client adresar');
    await expect(book.getByRole('button', { name: 'Adresă nouă', exact: true })).toBeEnabled();
    await expect(resolve).toHaveCount(0);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), pending![0])).toBe(
      pending![1],
    );
    await detail.getByRole('button', { name: 'Închide profilul', exact: true }).click();
    await open('Paginare adresar');
    await expect(resolve).toBeEnabled();
    await resolve.click();
    await expect(
      book.getByText('Tentativa a fost retrasă definitiv. Poți începe explicit o operație nouă.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), pending![0])).toBeNull();
    expect(
      (
        await (
          await api(page, `/customers/${customer.id}/address-book?locationId=${f.location.id}`)
        ).json()
      ).addresses,
    ).toHaveLength(21);
  } finally {
    await f.dispose();
  }
});
