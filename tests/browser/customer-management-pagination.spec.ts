import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection, submit } from './support/browser-helpers';

test('administrare clienți listă: paginare, căutare fără contacte în URL și înregistrare cu răspuns pierdut', async ({
  browser,
}) => {
  const f = await operationsFixture(browser);
  const page = f.admin;
  try {
    for (let index = 0; index < 31; index++)
      expect(
        (
          await api(page, '/customers', {
            locationId: f.location.id,
            requestKey: randomUUID(),
            name: 'Lot CRM sintetic',
            phone: `0604${String(index).padStart(5, '0')}`,
          })
        ).status(),
      ).toBe(200);
    const urls: string[] = [];
    page.on('request', (request) => urls.push(decodeURIComponent(request.url())));
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Clienți');
    const rows = page.getByRole('row').filter({ hasText: 'Lot CRM sintetic' });
    await expect(rows).toHaveCount(30);
    await page.getByRole('button', { name: 'Încarcă mai mulți clienți', exact: true }).click();
    await expect(rows).toHaveCount(31);
    await page.getByLabel('Caută după', { exact: true }).selectOption('NAME');
    await page.getByLabel('Valoare exactă', { exact: true }).fill('Lot CRM sintetic');
    await submit(
      page,
      '/api/tenant/customers/search',
      page.getByRole('button', { name: 'Caută', exact: true }),
    );
    await expect(rows).toHaveCount(30);
    await page.getByRole('button', { name: 'Încarcă mai mulți clienți', exact: true }).click();
    await expect(rows).toHaveCount(31);
    await page.getByRole('button', { name: 'Client nou', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Client nou', exact: true });
    await dialog.getByLabel('Nume', { exact: true }).fill('Înregistrare unică');
    await dialog.getByLabel('Telefon', { exact: true }).fill('060499999');
    const bodies: string[] = [];
    let committedId = '';
    await page.route(
      '**/api/tenant/customers',
      async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        bodies.push(route.request().postData()!);
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        committedId = (await response.json()).customer.id;
        await route.abort('failed');
      },
      { times: 1 },
    );
    await dialog.getByRole('button', { name: 'Înregistrează clientul', exact: true }).click();
    const retry = dialog.getByRole('button', { name: 'Reîncearcă înregistrarea', exact: true });
    await expect(retry).toBeEnabled();
    await expect(dialog.getByLabel('Telefon', { exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Anulează', exact: true })).toBeDisabled();
    const replayRequest = page.waitForRequest(
      (request) => request.url().endsWith('/api/tenant/customers') && request.method() === 'POST',
    );
    const replay = await submit(page, '/api/tenant/customers', retry);
    expect((await replayRequest).postData()).toBe(bodies[0]);
    expect(replay.customer.id).toBe(committedId);
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Șterge căutarea', exact: true }).click();
    await page.getByLabel('Valoare exactă', { exact: true }).fill('060499999');
    await submit(
      page,
      '/api/tenant/customers/search',
      page.getByRole('button', { name: 'Caută', exact: true }),
    );
    await expect(page.getByRole('row').filter({ hasText: 'Înregistrare unică' })).toHaveCount(1);
    const storage = await page.evaluate(() =>
      JSON.stringify({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
      }),
    );
    for (const value of ['Lot CRM sintetic', 'Înregistrare unică', '060499999']) {
      expect(urls.join('\n')).not.toContain(value);
      expect(storage).not.toContain(value);
    }
  } finally {
    await f.dispose();
  }
});
