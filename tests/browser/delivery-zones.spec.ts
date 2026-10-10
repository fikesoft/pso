import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { navigateSection, noOverflow } from './support/browser-helpers';

test('zone de livrare: cerc, poligon, program, arhivare/restaurare și responsive', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser),
    page = f.admin;
  try {
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Zone de livrare');
    await page.getByRole('button', { name: 'Zonă nouă', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Numele zonei', { exact: true }).fill('Centru cerc');
    await dialog.getByLabel('Latitudine', { exact: true }).fill('47.02');
    await dialog.getByLabel('Longitudine', { exact: true }).fill('28.83');
    await dialog.getByLabel('Comandă minimă', { exact: true }).fill('100');
    await dialog.getByLabel('Tarif de livrare', { exact: true }).fill('25');
    await dialog.getByLabel('Livrare gratuită de la (opțional)', { exact: true }).fill('300');
    await dialog
      .getByLabel('Program săptămânal', { exact: true })
      .fill('luni 09:00-18:00\nmarti 00:00-24:00');
    await expect(dialog.getByRole('img', { name: 'Schița zonei' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Salvează zona', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const card = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Centru cerc', exact: true }) });
    await expect(
      card.getByText('Comandă minimă: 100.00 MDL · Tarif de livrare: 25.00 MDL', { exact: true }),
    ).toBeVisible();
    await card.getByRole('button', { name: 'Editează zona', exact: true }).click();
    await dialog.getByLabel('Forma zonei', { exact: true }).selectOption('POLYGON');
    for (const [index, [latitude, longitude]] of [
      [47, 28],
      [47.5, 28.5],
      [48, 29],
    ].entries()) {
      await dialog.getByLabel(`Latitudine ${index + 1}`, { exact: true }).fill(String(latitude));
      await dialog.getByLabel(`Longitudine ${index + 1}`, { exact: true }).fill(String(longitude));
    }
    await dialog.getByRole('button', { name: 'Salvează zona', exact: true }).click();
    await expect(
      dialog.getByText(
        'Poligonul trebuie să fie simplu, fără puncte repetate, intersecții sau traversarea antimeridianului.',
        { exact: true },
      ),
    ).toBeVisible();
    await dialog.getByLabel('Longitudine 3', { exact: true }).fill('28');
    await dialog.getByLabel('Numele zonei', { exact: true }).fill('Centru poligon');
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await dialog.getByRole('img', { name: 'Schița zonei' }).scrollIntoViewIfNeeded();
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`delivery-zone-${width}.png`),
        fullPage: true,
      });
    }
    await dialog.getByRole('button', { name: 'Salvează zona', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const edited = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Centru poligon', exact: true }) });
    await edited.getByRole('button', { name: 'Arhivează zona', exact: true }).click();
    await dialog.getByLabel('Confirm schimbarea stării zonei', { exact: true }).check();
    await dialog.getByRole('button', { name: 'Arhivează zona', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Centru poligon', exact: true })).toHaveCount(0);
    await page.getByLabel('Starea zonelor', { exact: true }).selectOption('ARCHIVED');
    await edited.getByRole('button', { name: 'Restaurează zona', exact: true }).click();
    await dialog.getByLabel('Confirm schimbarea stării zonei', { exact: true }).check();
    await dialog.getByRole('button', { name: 'Restaurează zona', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByLabel('Starea zonelor', { exact: true }).selectOption('ACTIVE');
    await expect(edited).toBeVisible();
  } finally {
    await f.dispose();
  }
});
