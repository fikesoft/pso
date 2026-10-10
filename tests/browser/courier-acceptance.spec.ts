import { test, expect } from '@playwright/test';
import { courierWorkFixture } from './support/courier-work-fixture';
import { navigateSection } from './support/browser-helpers';
test('livrările mele acceptare: commit pierdut, reload, retry identic și retragere', async ({
  browser,
}) => {
  const f = await courierWorkFixture(browser, 0, 3),
    page = f.admin;
  try {
    await navigateSection(page, 'Livrările mele');
    const card = (index: number) =>
      page.locator('article').filter({
        has: page.getByRole('heading', { name: `Comanda #${f.numbers[index]}`, exact: true }),
      });
    const dialog = page.getByRole('dialog'),
      route = '**/api/tenant/courier-work/*/accept';
    await page.route(
      route,
      async (intercept) => {
        expect((await intercept.fetch()).status()).toBe(200);
        await intercept.abort();
      },
      { times: 1 },
    );
    await card(0).getByRole('button', { name: 'Detalii livrare', exact: true }).click();
    await dialog.getByRole('button', { name: 'Acceptă livrarea', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Verifică tentativa de acceptare', exact: true }),
    ).toBeVisible();
    const stored = await page.evaluate(() =>
      Object.entries(sessionStorage)
        .filter(([key]) => key.startsWith('pos.courier-acceptance:'))
        .map(([, value]) => value)
        .join(''),
    );
    expect(stored).toContain('requestKey');
    expect(stored).not.toContain('confirmed');
    expect(stored).not.toContain('Client');
    expect(stored).not.toContain('orderVersion');
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.otherLocation.id);
    await navigateSection(page, 'Livrările mele');
    await expect(
      page.getByRole('button', { name: 'Verifică tentativa de acceptare', exact: true }),
    ).toHaveCount(0);
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await page
      .getByRole('button', { name: 'Verifică tentativa de acceptare', exact: true })
      .click();
    await expect(card(0).getByText('Livrare acceptată', { exact: true })).toBeVisible();
    let sent = '';
    await page.route(
      route,
      async (intercept) => {
        sent = intercept.request().postData()!;
        expect((await intercept.fetch()).status()).toBe(200);
        await intercept.abort();
      },
      { times: 1 },
    );
    await card(1).getByRole('button', { name: 'Detalii livrare', exact: true }).click();
    await dialog.getByRole('button', { name: 'Acceptă livrarea', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Reîncearcă aceeași acceptare', exact: true }),
    ).toBeVisible();
    await page.route(
      route,
      async (intercept) => {
        expect(intercept.request().postData()).toBe(sent);
        await intercept.continue();
      },
      { times: 1 },
    );
    await dialog.getByRole('button', { name: 'Reîncearcă aceeași acceptare', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card(1).getByText('Livrare acceptată', { exact: true })).toBeVisible();
    await page.route(route, (intercept) => intercept.abort(), { times: 1 });
    await card(2).getByRole('button', { name: 'Detalii livrare', exact: true }).click();
    await dialog.getByRole('button', { name: 'Acceptă livrarea', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Verifică tentativa de acceptare', exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Livrările mele');
    await page
      .getByRole('button', { name: 'Verifică tentativa de acceptare', exact: true })
      .click();
    await expect(
      page.getByText('Tentativa de acceptare neexecutată a fost retrasă.', { exact: true }),
    ).toBeVisible();
    await expect(card(2).getByText('Livrare acceptată', { exact: true })).toHaveCount(0);
    await card(2).getByRole('button', { name: 'Detalii livrare', exact: true }).click();
    await dialog.getByRole('button', { name: 'Acceptă livrarea', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card(2).getByText('Livrare acceptată', { exact: true })).toBeVisible();
  } finally {
    await f.dispose();
  }
});
