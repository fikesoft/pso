import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, noOverflow, submit } from './support/browser-helpers';

test('upsell: reguli locale, creare recuperată, conflict și arhivare pe mobil', async ({
  browser,
}, info) => {
  const fixture = await operationsFixture(browser);
  const { admin, location } = fixture;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const source = await createOperationalProduct(admin);
    const target = (
      await (
        await api(admin, '/catalog/products', {
          locationId: location.id,
          name: 'Ceai recomandat',
          sku: 'UPSELL-E2E',
          price: '5',
        })
      ).json()
    ).product;
    await admin.getByRole('button', { name: 'Reguli de recomandare', exact: true }).click();
    await admin.getByRole('button', { name: 'Regulă nouă', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: 'Regulă nouă', exact: true });
    await dialog.getByLabel('Numele regulii', { exact: true }).fill('Cafea cu ceai');
    await dialog.getByLabel('Produs declanșator', { exact: true }).selectOption(source.id);
    await dialog.getByLabel('Produs recomandat', { exact: true }).selectOption(target.id);
    await dialog.getByLabel('Ordine recomandare', { exact: true }).fill('3');
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('upsell-rule-360.png'), fullPage: true });
    let lost = false;
    await admin.route('**/api/tenant/catalog/upsell-rules', async (route) => {
      if (!lost && route.request().method() === 'POST') {
        lost = true;
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('connectionfailed');
      } else await route.continue();
    });
    await dialog.getByRole('button', { name: 'Salvează regula', exact: true }).click();
    await expect(dialog.getByText(/Confirmarea nu a ajuns/)).toBeVisible();
    await expect(dialog.getByLabel('Numele regulii')).toBeDisabled();
    const created = await submit(
      admin,
      '/api/tenant/catalog/upsell-rules',
      dialog.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    );
    await expect(dialog).not.toBeVisible();
    expect(
      (await (await api(admin, `/catalog/upsell-rules?locationId=${location.id}`)).json()).rules,
    ).toHaveLength(1);
    await admin
      .getByRole('button', { name: 'Editează regula: Cafea cu ceai', exact: true })
      .click();
    const edit = admin.getByRole('dialog', { name: 'Editează regula', exact: true });
    expect(
      (
        await api(
          admin,
          `/catalog/upsell-rules/${created.rule.id}`,
          {
            version: created.rule.version,
            name: 'Cafea și ceai actualizat',
            sortOrder: 2,
            status: 'ACTIVE',
          },
          'PATCH',
        )
      ).status(),
    ).toBe(200);
    await edit.getByLabel('Stare', { exact: true }).selectOption('ARCHIVED');
    await edit.getByRole('button', { name: 'Salvează regula', exact: true }).click();
    await expect(edit.getByRole('alert')).toContainText('Regula a fost modificată. Reîncărcați.');
    await edit.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await expect(edit.getByLabel('Numele regulii')).toHaveValue('Cafea și ceai actualizat');
    await edit.getByLabel('Stare', { exact: true }).selectOption('ARCHIVED');
    await edit.getByRole('button', { name: 'Salvează regula', exact: true }).click();
    await expect(edit).not.toBeVisible();
    await expect(admin.getByText('Arhivat · Ordine recomandare: 2', { exact: true })).toBeVisible();
  } finally {
    await fixture.dispose();
  }
});
