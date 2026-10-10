import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { navigateSection } from './support/browser-helpers';

test('zone de livrare recuperare: creare pierdută, reload, context separat și retragere', async ({
  browser,
}) => {
  const f = await operationsFixture(browser),
    page = f.admin;
  try {
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Zone de livrare');
    const fill = async (name: string) => {
      await page.getByRole('button', { name: 'Zonă nouă', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Numele zonei', { exact: true }).fill(name);
      await dialog.getByLabel('Latitudine', { exact: true }).fill('47.02');
      await dialog.getByLabel('Longitudine', { exact: true }).fill('28.83');
      return dialog;
    };
    const route = '**/api/tenant/delivery-zones/*/commands';
    await page.route(
      route,
      async (intercept) => {
        expect((await intercept.fetch()).status()).toBe(200);
        await intercept.abort();
      },
      { times: 1 },
    );
    await (await fill('Zonă răspuns pierdut'))
      .getByRole('button', { name: 'Salvează zona', exact: true })
      .click();
    await expect(
      page.getByText(
        'Rezultatul operației nu este confirmat. Verifică înainte de a iniția o altă operație.',
        { exact: true },
      ),
    ).toBeVisible();
    const saved = await page.evaluate(() =>
      Object.entries(sessionStorage)
        .filter(([key]) => key.startsWith('pos.delivery-zone:'))
        .map(([, value]) => value)
        .join(''),
    );
    expect(saved).not.toContain('Zonă răspuns pierdut');
    expect(saved).not.toContain('latitude');
    expect(saved).toContain('requestKey');
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Zone de livrare');
    await page.getByRole('button', { name: 'Verifică sau retrage tentativa', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Zonă răspuns pierdut', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Verifică sau retrage tentativa', exact: true }),
    ).toHaveCount(0);
    await page.route(
      route,
      async (intercept) => {
        expect((await intercept.fetch()).status()).toBe(200);
        await intercept.abort();
      },
      { times: 1 },
    );
    await page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Zonă răspuns pierdut', exact: true }) })
      .getByRole('button', { name: 'Editează zona', exact: true })
      .click();
    const edit = page.getByRole('dialog');
    await edit.getByLabel('Numele zonei', { exact: true }).fill('Zonă actualizată');
    await edit.getByRole('button', { name: 'Salvează zona', exact: true }).click();
    await edit
      .getByRole('button', { name: 'Reîncearcă exact aceeași operație', exact: true })
      .click();
    await expect(edit).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Zonă actualizată', exact: true }),
    ).toBeVisible();
    await page.route(route, (intercept) => intercept.abort(), { times: 1 });
    await (await fill('Zonă neexecutată'))
      .getByRole('button', { name: 'Salvează zona', exact: true })
      .click();
    await expect(
      page.getByText(
        'Rezultatul operației nu este confirmat. Verifică înainte de a iniția o altă operație.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.otherLocation.id);
    await navigateSection(page, 'Zone de livrare');
    await expect(
      page.getByRole('button', { name: 'Verifică sau retrage tentativa', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Zonă răspuns pierdut', exact: true }),
    ).toHaveCount(0);
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await page.getByRole('button', { name: 'Verifică sau retrage tentativa', exact: true }).click();
    await expect(
      page.getByText('Tentativa neexecutată a fost retrasă. Poți iniția o operație nouă.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Zonă neexecutată', exact: true })).toHaveCount(
      0,
    );
  } finally {
    await f.dispose();
  }
});
