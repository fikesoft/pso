import { test, expect } from '@playwright/test';
import { courierWorkFixture } from './support/courier-work-fixture';
import { navigateSection, noOverflow } from './support/browser-helpers';

test('livrările mele: active, istoric, detalii, eroare și responsive', async ({
  browser,
}, info) => {
  const f = await courierWorkFixture(browser),
    page = f.admin;
  try {
    const { numbers } = f;
    await navigateSection(page, 'Livrările mele');
    await expect(
      page.getByRole('heading', { name: `Comanda #${numbers[1]}`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: `Comanda #${numbers[0]}`, exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Detalii livrare', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByText('Client: Client livrare sintetic', { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText('De încasat: 10.01 MDL', { exact: true })).toBeVisible();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`courier-work-${width}.png`), fullPage: true });
    }
    await page.keyboard.press('Escape');
    await page.getByLabel('Lista livrărilor', { exact: true }).selectOption('HISTORY');
    await expect(
      page.getByRole('heading', { name: `Comanda #${numbers[0]}`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: `Comanda #${numbers[1]}`, exact: true }),
    ).toHaveCount(0);
    await page.route('**/api/tenant/courier-work?**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Livrări temporar indisponibile' }),
      }),
    );
    await page.getByRole('button', { name: 'Reîncarcă livrările mele', exact: true }).click();
    await expect(page.getByText('Livrări temporar indisponibile', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: `Comanda #${numbers[0]}`, exact: true }),
    ).toHaveCount(0);
    await page.unroute('**/api/tenant/courier-work?**');
    await page.getByRole('button', { name: 'Reîncarcă livrările mele', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `Comanda #${numbers[0]}`, exact: true }),
    ).toBeVisible();
  } finally {
    await f.dispose();
  }
});
