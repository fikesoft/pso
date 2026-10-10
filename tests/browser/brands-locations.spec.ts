import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('branduri și locații: metadate, program peste miezul nopții și conflicte', async ({
  browser,
}, info) => {
  const fixture = await operationsFixture(browser);
  const page = fixture.admin;
  try {
    await navigateSection(page, 'Branduri');
    await expect(page.getByText('Niciun brand disponibil', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Adaugă brand', exact: true }).click();
    const brandDialog = page.getByRole('dialog', { name: 'Adaugă brand', exact: true });
    await brandDialog.getByLabel('Denumire brand').fill('E2E Coffee House');
    await brandDialog.getByLabel('Cod brand').fill('COFFEE');
    const created = await submit(
      page,
      '/api/tenant/brands',
      brandDialog.getByRole('button', { name: 'Creează brandul' }),
    );
    await expect(brandDialog).not.toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'E2E Coffee House' })).toBeVisible();
    await navigateSection(page, 'Locații');
    await page
      .getByRole('row')
      .filter({ hasText: 'E2E Centru' })
      .getByRole('button', { name: 'Editează' })
      .click();
    const locationDialog = page.getByRole('dialog');
    await locationDialog
      .getByLabel('Brand', { exact: true })
      .selectOption({ label: 'E2E Coffee House' });
    await locationDialog
      .getByLabel('Adresă (opțional)', { exact: true })
      .fill('Strada Sintetică 10');
    await locationDialog.getByLabel('Telefon locație').fill('+37322000123');
    await locationDialog.getByLabel('Fus orar IANA').fill('Europe/Chisinau');
    await locationDialog.getByLabel('Latitudine').fill('47.024512');
    await locationDialog.getByLabel('Longitudine').fill('28.832157');
    await locationDialog.getByRole('checkbox', { name: 'Luni', exact: true }).check();
    await locationDialog.getByLabel('Deschidere · Luni').fill('20:00');
    await locationDialog.getByLabel('Închidere · Luni').fill('02:00');
    await page.setViewportSize({ width: 360, height: 800 });
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath('location-metadata-mobile.png'),
      fullPage: true,
    });
    await locationDialog.getByRole('button', { name: 'Salvează modificările' }).click();
    await expect(locationDialog).not.toBeVisible();
    const locations = await (await api(page, '/locations')).json();
    const stored = locations.locations.find(
      (location: { id: string }) => location.id === fixture.location.id,
    );
    expect(stored).toMatchObject({
      brandId: created.brand.id,
      phone: '+37322000123',
      latitude: '47.024512',
      longitude: '28.832157',
      businessHours: [{ day: 1, opensAt: '20:00', closesAt: '02:00' }],
    });
    await expect(page.getByRole('row').filter({ hasText: 'E2E Centru' })).toContainText(
      'E2E Coffee House',
    );
    await page
      .getByRole('row')
      .filter({ hasText: 'E2E Centru' })
      .getByRole('button', { name: 'Editează' })
      .click();
    await expect(locationDialog.getByLabel('Telefon locație')).toHaveValue('+37322000123');
    await expect(locationDialog.getByLabel('Închidere · Luni')).toHaveValue('02:00');
    const concurrent = await api(
      page,
      `/locations/${stored.id}`,
      { version: stored.version, phone: '+37322000456' },
      'PATCH',
    );
    expect(concurrent.status()).toBe(200);
    await locationDialog.getByRole('button', { name: 'Salvează modificările' }).click();
    await expect(locationDialog.getByText('Locația a fost modificată. Reîncărcați.')).toBeVisible();
    await page.keyboard.press('Escape');
    await navigateSection(page, 'Branduri');
    await page
      .getByRole('row')
      .filter({ hasText: 'E2E Coffee House' })
      .getByRole('button', { name: 'Editează' })
      .click();
    const editBrand = page.getByRole('dialog', { name: 'Editează brandul' });
    await editBrand.getByLabel('Stare').selectOption('DISABLED');
    await editBrand.getByRole('button', { name: 'Salvează modificările' }).click();
    await expect(editBrand.getByText(/Brandul are locații active/)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.route('**/api/tenant/brands', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Încărcare indisponibilă sintetică' }),
      }),
    );
    await page.getByRole('button', { name: 'Reîncarcă brandurile' }).click();
    await expect(page.getByText('Încărcare indisponibilă sintetică')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'E2E Coffee House' })).toHaveCount(0);
    await page.unroute('**/api/tenant/brands');
    await page.getByRole('button', { name: 'Reîncarcă brandurile' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'E2E Coffee House' })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('brands-mobile.png'), fullPage: true });
  } finally {
    await fixture.dispose();
  }
});
