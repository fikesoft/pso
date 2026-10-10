import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('catalog: cotă fiscală exactă, conflict și diferența dintre zero și neconfigurat', async ({
  browser,
}, info) => {
  const fixture = await operationsFixture(browser);
  const { admin, location } = fixture;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(admin, 'Catalog');
    await admin.getByRole('button', { name: 'Produs nou', exact: true }).click();
    const create = admin.getByRole('dialog', { name: 'Produs nou', exact: true });
    await create.getByLabel('Numele produsului').fill('Produs cu taxă sintetică');
    await create.getByLabel('Cod produs').fill('TAX-E2E');
    await create.getByLabel('Preț local (MDL)').fill('10.0000');
    await create.getByLabel('Cotă de taxă (%)', { exact: true }).fill('7,1250');
    const saved = await submit(
      admin,
      '/api/tenant/catalog/products',
      create.getByRole('button', { name: 'Salvează produsul' }),
    );
    expect(saved.product.taxRate).toBe('7.1250');
    const card = admin.locator('article').filter({
      has: admin.getByRole('heading', { name: 'Produs cu taxă sintetică', exact: true }),
    });
    await expect(card).toContainText('7.1250');
    await card.getByRole('button', { name: 'Editează', exact: true }).click();
    const edit = admin.getByRole('dialog', { name: 'Editează produsul', exact: true });
    const changed = await api(
      admin,
      `/catalog/products/${saved.product.id}`,
      { version: saved.product.version, taxRate: '8.0000' },
      'PATCH',
    );
    expect(changed.status()).toBe(200);
    await edit.getByLabel('Cotă de taxă (%)', { exact: true }).fill('0');
    await edit.getByRole('button', { name: 'Salvează datele comune', exact: true }).click();
    await expect(edit.getByRole('alert')).toContainText('Produsul a fost modificat. Reîncărcați.');
    await edit.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await expect(edit.getByLabel('Cotă de taxă (%)', { exact: true })).toHaveValue('8.0000');
    await admin.setViewportSize({ width: 360, height: 800 });
    await edit.getByLabel('Cotă de taxă (%)', { exact: true }).scrollIntoViewIfNeeded();
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('product-tax-360.png'), fullPage: true });
    await edit.getByLabel('Cotă de taxă (%)', { exact: true }).fill('0');
    await edit.getByRole('button', { name: 'Salvează datele comune', exact: true }).click();
    await expect(edit).not.toBeVisible();
    await expect(card).toContainText('0.0000');
    await card.getByRole('button', { name: 'Editează', exact: true }).click();
    await edit.getByLabel('Cotă de taxă (%)', { exact: true }).fill('');
    await edit.getByRole('button', { name: 'Salvează datele comune', exact: true }).click();
    await expect(edit).not.toBeVisible();
    await expect(card).toContainText('Taxă neconfigurată');
    const product = (
      await (
        await api(admin, `/catalog/products/${saved.product.id}?locationId=${location.id}`)
      ).json()
    ).product;
    expect(product.taxRate).toBeNull();
    expect(product.price).toBe('10.0000');
  } finally {
    await fixture.dispose();
  }
});
