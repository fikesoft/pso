import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { navigateSection, noOverflow, session } from './support/browser-helpers';

test('curieri: profil, disponibilitate, arhivare/restaurare și responsive', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser),
    page = f.admin;
  try {
    const identity = await session(page);
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Curieri');
    await page.getByRole('button', { name: 'Înregistrează curier', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Utilizator curier', { exact: true }).selectOption(identity.user.id);
    await dialog.getByLabel('Mijloc de transport', { exact: true }).selectOption('CAR');
    await dialog.getByLabel('Capacitate simultană', { exact: true }).fill('3');
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`courier-form-${width}.png`), fullPage: true });
    }
    await dialog.getByRole('button', { name: 'Salvează curierul', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const card = page.locator('article').filter({
      has: page.getByRole('button', { name: 'Editează profilul curierului', exact: true }),
    });
    await expect(
      card.getByText('Mijloc de transport: Mașină · Capacitate simultană: 3', { exact: true }),
    ).toBeVisible();
    await card.getByRole('button', { name: 'Schimbă disponibilitatea', exact: true }).click();
    await dialog.getByLabel('Disponibilitate', { exact: true }).selectOption('AVAILABLE');
    await dialog.getByRole('button', { name: 'Salvează curierul', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      card.getByText('Disponibilitate: Disponibil · Livrări active: 0', { exact: true }),
    ).toBeVisible();
    await card.getByRole('button', { name: 'Editează profilul curierului', exact: true }).click();
    await dialog.getByLabel('Capacitate simultană', { exact: true }).fill('2');
    await dialog.getByRole('button', { name: 'Salvează curierul', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await card.getByRole('button', { name: 'Arhivează curierul', exact: true }).click();
    await dialog.getByLabel('Confirm schimbarea stării curierului', { exact: true }).check();
    await dialog.getByRole('button', { name: 'Salvează curierul', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card).toHaveCount(0);
    await page.getByLabel('Starea profilurilor', { exact: true }).selectOption('ARCHIVED');
    await page.getByRole('button', { name: 'Restaurează curierul', exact: true }).click();
    await dialog.getByLabel('Confirm schimbarea stării curierului', { exact: true }).check();
    await dialog.getByRole('button', { name: 'Salvează curierul', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByLabel('Starea profilurilor', { exact: true }).selectOption('ACTIVE');
    await expect(
      card.getByText('Disponibilitate: Offline · Livrări active: 0', { exact: true }),
    ).toBeVisible();
    await page.getByLabel('Context', { exact: true }).selectOption(f.otherLocation.id);
    await expect(card).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});
