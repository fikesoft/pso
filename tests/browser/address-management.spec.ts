import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('adresar CRM: creare, editare, preferință și arhivare responsive', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser);
  const page = f.admin;
  try {
    const customer = (
      await (
        await api(page, '/customers', {
          locationId: f.location.id,
          requestKey: randomUUID(),
          name: 'Client adresar',
          phone: '060310131',
        })
      ).json()
    ).customer;
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Clienți');
    await page.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Profil client', exact: true });
    const book = detail.getByRole('region', { name: 'Adresele clientului', exact: true });
    await book.getByRole('button', { name: 'Adresă nouă', exact: true }).click();
    await book.getByLabel('Etichetă adresă', { exact: true }).fill('Acasă CRM');
    await book.getByLabel('Adresă completă', { exact: true }).fill('Strada sintetică 131');
    await book.getByLabel('Instrucțiuni de livrare', { exact: true }).fill('Intrare curte');
    const created = await submit(
      page,
      `/api/tenant/customers/${customer.id}/addresses`,
      book.getByRole('button', { name: 'Salvează adresa', exact: true }),
    );
    const path = `/api/tenant/customers/${customer.id}/addresses/${created.address.id}/commands`;
    const card = book.getByRole('article', { name: 'Acasă CRM', exact: true });
    await expect(card).toBeVisible();
    await expect(card.getByText('Adresă implicită', { exact: true })).toHaveCount(0);
    const selected = await submit(
      page,
      path,
      card.getByRole('button', { name: 'Alege ca adresă implicită', exact: true }),
    );
    expect(selected.address.version).toBe(1);
    expect(selected.preference).toMatchObject({ version: 2, defaultAddressId: created.address.id });
    await expect(card.getByText('Adresă implicită', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Editează adresa', exact: true }).click();
    await book.getByLabel('Adresă completă', { exact: true }).fill('Strada'.repeat(70));
    const changed = await submit(
      page,
      path,
      book.getByRole('button', { name: 'Salvează adresa', exact: true }),
    );
    expect(changed.address.version).toBe(2);
    expect(changed.preference.version).toBe(2);
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await card.scrollIntoViewIfNeeded();
      await noOverflow(page);
      expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath(`address-book-${width}.png`) });
    }
    const cleared = await submit(
      page,
      path,
      card.getByRole('button', { name: 'Elimină preferința implicită', exact: true }),
    );
    expect(cleared.preference).toMatchObject({ version: 3, defaultAddressId: null });
    await card.getByRole('button', { name: 'Alege ca adresă implicită', exact: true }).click();
    await expect(card.getByText('Adresă implicită', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Arhivează adresa', exact: true }).click();
    const archived = await submit(
      page,
      path,
      card.getByRole('button', { name: 'Confirmă arhivarea adresei', exact: true }),
    );
    expect(archived).toMatchObject({
      address: { version: 3, status: 'ARCHIVED' },
      preference: { version: 5, defaultAddressId: null },
    });
    await expect(card).toHaveCount(0);
    await book.getByLabel('Starea adreselor', { exact: true }).selectOption('ARCHIVED');
    await expect(card.getByText('Adresă arhivată', { exact: true })).toBeVisible();
    await expect(card.getByRole('button')).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});
