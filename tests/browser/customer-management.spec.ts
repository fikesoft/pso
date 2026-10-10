import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('administrare clienți: creare, căutare, editare, arhivare și restaurare responsive', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser);
  const page = f.admin;
  try {
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Clienți');
    await page.getByRole('button', { name: 'Client nou', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'Client nou', exact: true });
    await create.getByLabel('Nume', { exact: true }).fill('Client CRM sintetic');
    await create.getByLabel('Telefon', { exact: true }).fill('060321456');
    await create.getByLabel('E-mail', { exact: true }).fill('crm@example.test');
    const registered = await submit(
      page,
      '/api/tenant/customers',
      create.getByRole('button', { name: 'Înregistrează clientul', exact: true }),
    );
    const id = registered.customer.id;
    await expect(create).toBeHidden();
    await page.getByLabel('Valoare exactă', { exact: true }).fill('060321456');
    await submit(
      page,
      '/api/tenant/customers/search',
      page.getByRole('button', { name: 'Caută', exact: true }),
    );
    const row = page.getByRole('row').filter({ hasText: 'Client CRM sintetic' });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Profil client', exact: true });
    await expect(detail.getByLabel('E-mail', { exact: true })).toHaveValue('crm@example.test');
    await detail.getByLabel('Nume', { exact: true }).fill('Client CRM actualizat');
    const path = `/api/tenant/customers/${id}/commands`;
    const changed = await submit(
      page,
      path,
      detail.getByRole('button', { name: 'Salvează profilul', exact: true }),
    );
    expect(changed.customer).toMatchObject({ name: 'Client CRM actualizat', version: 2 });
    await expect(detail).toBeHidden();
    await page.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`customer-profile-${width}.png`),
        fullPage: true,
      });
    }
    await detail.getByRole('button', { name: 'Arhivează clientul', exact: true }).click();
    const archived = await submit(
      page,
      path,
      detail.getByRole('button', { name: 'Confirmă', exact: true }),
    );
    expect(archived.customer).toMatchObject({ status: 'ARCHIVED', version: 3 });
    await expect(detail).toBeHidden();
    await expect(page.getByRole('button', { name: 'Deschide profilul', exact: true })).toHaveCount(
      0,
    );
    await page.getByLabel('Stare', { exact: true }).selectOption('ARCHIVED');
    await page.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    await expect(detail.getByLabel('Telefon', { exact: true })).toBeDisabled();
    await detail.getByRole('button', { name: 'Restaurează clientul', exact: true }).click();
    const restored = await submit(
      page,
      path,
      detail.getByRole('button', { name: 'Confirmă', exact: true }),
    );
    expect(restored.customer).toMatchObject({ status: 'ACTIVE', version: 4 });
    await expect(detail).toBeHidden();
    await page.getByLabel('Stare', { exact: true }).selectOption('ACTIVE');
    await expect(page.getByText('Client CRM actualizat', { exact: true })).toBeVisible();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`customer-list-${width}.png`),
        fullPage: true,
      });
    }
    expect(
      (await (await api(page, `/customers/${id}?locationId=${f.location.id}`)).json()).customer
        .version,
    ).toBe(4);
  } finally {
    await f.dispose();
  }
});
