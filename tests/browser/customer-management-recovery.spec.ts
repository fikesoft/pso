import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection } from './support/browser-helpers';

test('administrare clienți: răspuns pierdut, reload, rezultat istoric și retragerea tentativei', async ({
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
          name: 'Recuperare CRM',
          phone: '060321457',
        })
      ).json()
    ).customer;
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Clienți');
    await page.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Profil client', exact: true });
    const path = `/api/tenant/customers/${customer.id}/commands`;
    await page.route(`**${path}`, async (route) => {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await detail.getByLabel('Nume', { exact: true }).fill('Recuperare confirmată');
    await detail.getByRole('button', { name: 'Salvează profilul', exact: true }).click();
    const resolve = page.getByRole('button', {
      name: 'Verifică rezultatul operației',
      exact: true,
    });
    await expect(resolve).toBeEnabled();
    await expect(detail.getByLabel('Nume', { exact: true })).toBeDisabled();
    const pointers = await page.evaluate(() =>
      Object.entries(sessionStorage).filter(([key]) => key.startsWith('pos.customer-management:')),
    );
    expect(pointers).toHaveLength(1);
    expect(pointers[0][1]).not.toContain('Recuperare');
    expect(pointers[0][1]).not.toContain('060321457');
    await page.unroute(`**${path}`);
    expect(
      (
        await api(page, `/customers/${customer.id}/commands`, {
          locationId: f.location.id,
          action: 'ARCHIVE',
          version: 2,
          requestKey: randomUUID(),
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Clienți');
    await expect(resolve).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Client nou', exact: true })).toBeDisabled();
    await resolve.click();
    await expect(resolve).toHaveCount(0);
    await page.getByLabel('Stare', { exact: true }).selectOption('ARCHIVED');
    await page.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    await expect(detail.getByLabel('Nume', { exact: true })).toHaveValue('Recuperare confirmată');
    await page.route(`**${path}`, async (route) => {
      await route.abort('failed');
    });
    await detail.getByRole('button', { name: 'Restaurează clientul', exact: true }).click();
    await detail.getByRole('button', { name: 'Confirmă', exact: true }).click();
    await expect(resolve).toBeEnabled();
    const pending = await page.evaluate(
      () =>
        Object.entries(sessionStorage).find(([key]) =>
          key.startsWith('pos.customer-management:'),
        )?.[1],
    );
    const pointer = JSON.parse(pending!);
    await page.unroute(`**${path}`);
    await resolve.click();
    await expect(
      page.getByText('Tentativa a fost retrasă definitiv. Poți începe explicit o operație nouă.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await api(page, `/customers/${customer.id}/commands`, { ...pointer.command, version: 3 })
      ).status(),
    ).toBe(409);
    expect(
      (await (await api(page, `/customers/${customer.id}?locationId=${f.location.id}`)).json())
        .customer,
    ).toMatchObject({ version: 3, status: 'ARCHIVED' });
  } finally {
    await f.dispose();
  }
});
