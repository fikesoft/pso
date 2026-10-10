import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { packingBrowserFixture } from './packing-setup';
import { api, navigateSection, submit } from './support/browser-helpers';

test('ambalare recuperare: retragerea tentativei neexecutate și conflictul cer reîncărcare', async ({
  browser,
}) => {
  const f = await packingBrowserFixture(browser);
  const page = f.admin;
  try {
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Ambalare');
    const start = page.getByRole('button', { name: 'Începe verificarea', exact: true });
    await page.route(`**${f.path}`, (route) => route.abort('failed'));
    await start.click();
    const resolve = page.getByRole('button', {
      name: 'Verifică rezultatul operației',
      exact: true,
    });
    await expect(resolve).toBeEnabled();
    await expect(start).toBeDisabled();
    await page.unroute(`**${f.path}`);
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Ambalare');
    await resolve.click();
    await expect(
      page.getByText('Tentativa a fost retrasă definitiv. Poți începe explicit o operație nouă.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(start).toBeEnabled();
    const current = await (await api(page, `/packing/sessions/${f.session.id}`)).json();
    expect(current.session).toMatchObject({ version: 1, status: 'WAITING' });
    await submit(page, f.path, start);
    const checkbox = page.getByRole('checkbox').first();
    await page.route(
      `**${f.path}`,
      async (route) => {
        expect(
          (
            await api(page, `/packing/sessions/${f.session.id}/commands`, {
              action: 'CHECK_ITEM',
              version: 2,
              requestKey: randomUUID(),
              itemId: f.session.items[0].id,
              checked: true,
            })
          ).status(),
        ).toBe(200);
        await route.continue();
      },
      { times: 1 },
    );
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === f.path);
    await checkbox.click();
    expect((await response).status()).toBe(409);
    await expect(checkbox).toBeDisabled();
    await page.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Confirmă ambalarea', exact: true }),
    ).toBeEnabled();
  } finally {
    await f.dispose();
  }
});
