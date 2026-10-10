import { test, expect } from '@playwright/test';
import { localOnly, noOverflow } from './support/browser-helpers';
import { viewports } from './support/browser.constants';
test.beforeEach(async ({ context }) => {
  await localOnly(context);
});

for (const viewport of viewports) {
  test(`login, POS și TV sunt utilizabile la ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/c/sakura-demo/login');
    await expect(page.getByRole('heading', { name: 'Bine ai revenit' })).toBeVisible();
    await noOverflow(page);
    await expect(page.getByLabel('Cod PIN', { exact: true })).toHaveAttribute('type', 'password');
    await expect(page.getByLabel('Login', { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`pin-login-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Administratori · parolă', exact: true }).click();
    await page.getByLabel('Login', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Parolă', { exact: true })).toBeFocused();
    const focus = await page.getByLabel('Parolă', { exact: true }).evaluate((element) => {
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, shadow: style.boxShadow };
    });
    expect(focus.outline !== 'none' || focus.shadow !== 'none').toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`login-${viewport.width}.png`),
      fullPage: true,
    });

    await page.goto('/demo/pos');
    await expect(page.getByRole('heading', { name: 'Ce pregătim astăzi?' })).toBeVisible();
    await expect(page.getByText('DEMO · date sintetice', { exact: true })).toBeVisible();
    await noOverflow(page);
    const product = page.getByRole('button', { name: /Sushi Philadelphia clasic/ });
    await product.click();
    const dialog = page.getByRole('dialog', { name: 'Philadelphia clasic' });
    await expect(dialog).toBeVisible();
    await noOverflow(page);
    await dialog.getByRole('button', { name: 'Adaugă în ciornă' }).click();
    await expect(dialog).not.toBeVisible();
    if (viewport.width < 768) {
      const cartButton = page
        .getByRole('navigation', { name: 'Comandă mobilă' })
        .getByRole('button', { name: /Ciornă comandă/ });
      const box = await cartButton.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await cartButton.click();
      await expect(
        page
          .getByRole('dialog', { name: 'Comanda ta' })
          .getByText('Philadelphia clasic', { exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(cartButton).toBeFocused();
    }
    await page.getByRole('combobox', { name: 'Masa', exact: true }).selectOption('Masa 01');
    await expect(page.getByRole('status')).toContainText('Ciorna a fost golită');
    await page.getByLabel('Caută un produs').fill('produs care nu există');
    await expect(page.getByText('Niciun produs găsit.')).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`pos-${viewport.width}.png`),
      fullPage: true,
    });

    await page.goto('/demo/kitchen');
    await expect(page.getByRole('heading', { name: 'Bucătărie · Centru' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(4);
    await expect(page.getByText('DEMO', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/MDL|Telefon|Adresă/);
    await noOverflow(page);
    await page.getByRole('button', { name: 'Mărește textul' }).click();
    await expect(page.getByRole('button', { name: 'Text standard' })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`kitchen-${viewport.width}.png`),
      fullPage: true,
    });
  });
}
