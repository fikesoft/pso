import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection, noOverflow } from './support/browser-helpers';
test('stații de bucătărie: creare, recuperare după reload, modificare și arhivare pe mobil', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser),
    page = f.admin;
  try {
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await page.setViewportSize({ width: 360, height: 800 });
    await navigateSection(page, 'Bucătărie');
    await page.getByRole('button', { name: 'Stații de bucătărie', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Stații de bucătărie', exact: true });
    await panel.getByRole('button', { name: 'Adaugă stație', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Codul stației', { exact: true }).fill('BAR');
    await dialog.getByLabel('Denumirea stației', { exact: true }).fill('Bar sintetic');
    let stationId = '';
    await page.route(
      '**/api/tenant/kitchen-stations',
      async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        const result = await route.fetch();
        expect(result.status()).toBe(200);
        stationId = (await result.json()).station.id;
        await route.abort('failed');
      },
      { times: 1 },
    );
    await dialog.getByRole('button', { name: 'Salvează stația', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }),
    ).toBeVisible();
    await expect(dialog.getByLabel('Denumirea stației', { exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      panel.getByRole('heading', { name: 'BAR · Bar sintetic', exact: true }),
    ).toBeVisible();
    const list = await api(page, `/kitchen-stations?locationId=${f.location.id}`);
    expect((await list.json()).stations).toHaveLength(1);
    await panel.getByRole('button', { name: 'Modifică stația', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Denumirea stației', { exact: true }).fill('Bar redenumit');
    await page.route(
      `**/api/tenant/kitchen-stations/${stationId}`,
      async (route) => {
        const result = await route.fetch();
        expect(result.status()).toBe(200);
        await route.abort('failed');
      },
      { times: 1 },
    );
    await dialog.getByRole('button', { name: 'Salvează stația', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Bucătărie');
    await page.getByRole('button', { name: 'Stații de bucătărie', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Adaugă stație', exact: true })).toBeDisabled();
    await expect(
      panel.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }),
    ).not.toBeVisible();
    await panel.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }).click();
    await expect(
      panel.getByRole('heading', { name: 'BAR · Bar redenumit', exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Adaugă stație', exact: true })).toBeEnabled();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`stations-${width}.png`), fullPage: true });
    }
    await panel.getByRole('button', { name: 'Arhivează stația', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmă arhivarea', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await panel.getByLabel('Starea stațiilor', { exact: true }).selectOption('ARCHIVED');
    await expect(
      panel.getByRole('heading', { name: 'BAR · Bar redenumit', exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Modifică stația', exact: true }),
    ).not.toBeVisible();
    const archived = await api(
      page,
      `/kitchen-stations?locationId=${f.location.id}&status=ARCHIVED`,
    );
    expect((await archived.json()).stations[0]).toMatchObject({
      id: stationId,
      version: 3,
      status: 'ARCHIVED',
    });
  } finally {
    await f.dispose();
  }
});
