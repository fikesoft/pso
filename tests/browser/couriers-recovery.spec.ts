import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { navigateSection, session } from './support/browser-helpers';

test('curieri recuperare: răspuns pierdut, reload, retry identic și retragere', async ({
  browser,
}) => {
  const f = await operationsFixture(browser),
    page = f.admin;
  try {
    const identity = await session(page);
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Curieri');
    const route = '**/api/tenant/couriers/*/commands';
    await page.route(
      route,
      async (intercept) => {
        expect((await intercept.fetch()).status()).toBe(200);
        await intercept.abort();
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Înregistrează curier', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Utilizator curier', { exact: true }).selectOption(identity.user.id);
    await dialog.getByRole('button', { name: 'Salvează curierul', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Verifică tentativa curierului', exact: true }),
    ).toBeVisible();
    const saved = await page.evaluate(() =>
      Object.entries(sessionStorage)
        .filter(([key]) => key.startsWith('pos.courier:'))
        .map(([, value]) => value)
        .join(''),
    );
    expect(saved).toContain('requestKey');
    expect(saved).not.toContain('profile');
    expect(saved).not.toContain('capacity');
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.otherLocation.id);
    await navigateSection(page, 'Curieri');
    await expect(
      page.getByRole('button', { name: 'Verifică tentativa curierului', exact: true }),
    ).toHaveCount(0);
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await page.getByRole('button', { name: 'Verifică tentativa curierului', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Verifică tentativa curierului', exact: true }),
    ).toHaveCount(0);
    let body = '';
    await page.route(
      route,
      async (intercept) => {
        body = intercept.request().postData()!;
        expect((await intercept.fetch()).status()).toBe(200);
        await intercept.abort();
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Editează profilul curierului', exact: true }).click();
    await dialog.getByLabel('Capacitate simultană', { exact: true }).fill('4');
    await dialog.getByRole('button', { name: 'Salvează curierul', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Reîncearcă aceeași modificare', exact: true }),
    ).toBeVisible();
    await page.route(
      route,
      async (intercept) => {
        expect(intercept.request().postData()).toBe(body);
        await intercept.continue();
      },
      { times: 1 },
    );
    await dialog
      .getByRole('button', { name: 'Reîncearcă aceeași modificare', exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText('Mijloc de transport: Bicicletă · Capacitate simultană: 4', { exact: true }),
    ).toBeVisible();
    await page.route(route, (intercept) => intercept.abort(), { times: 1 });
    await page.getByRole('button', { name: 'Editează profilul curierului', exact: true }).click();
    await dialog.getByLabel('Capacitate simultană', { exact: true }).fill('5');
    await dialog.getByRole('button', { name: 'Salvează curierul', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Verifică tentativa curierului', exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Curieri');
    await page.getByRole('button', { name: 'Verifică tentativa curierului', exact: true }).click();
    await expect(
      page.getByText('Tentativa neexecutată a fost retrasă. Puteți începe o cerere nouă.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText('Mijloc de transport: Bicicletă · Capacitate simultană: 4', { exact: true }),
    ).toBeVisible();
  } finally {
    await f.dispose();
  }
});
