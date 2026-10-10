import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { courierWorkFixture } from './support/courier-work-fixture';
import { api, navigateSection } from './support/browser-helpers';
import { completePacking } from './support/complete-packing';
test('curier mobil: preluare, pornire, eșec și recuperare după reload', async ({ browser }) => {
  const f = await courierWorkFixture(browser, 0, 1),
    page = f.admin,
    id = f.orderIds[0]!;
  try {
    await navigateSection(page, 'Livrările mele');
    const open = () => page.getByRole('button', { name: 'Detalii livrare', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await open();
    await dialog.getByRole('button', { name: 'Acceptă livrarea', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await open();
    await expect(
      dialog.getByRole('button', { name: 'Confirmă preluarea', exact: true }),
    ).toBeDisabled();
    const current = (await (await api(page, `/orders/${id}`)).json()).order;
    const response = await api(page, `/orders/${id}/send`, {
      version: current.version,
      requestKey: randomUUID(),
    });
    expect(response.status()).toBe(200);
    const sent = await response.json();
    for (const [index, status] of ['PREPARING', 'READY'].entries())
      expect(
        (
          await api(
            page,
            `/kitchen/tickets/${sent.ticket.id}`,
            { version: index + 1, status },
            'PATCH',
          )
        ).status(),
      ).toBe(200);
    await completePacking(page, id);
    await dialog.getByRole('button', { name: 'Reîncarcă livrările mele', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Confirmă preluarea', exact: true }),
    ).toBeEnabled();
    const route = `**/api/tenant/orders/${id}/delivery`;
    await page.route(
      route,
      async (intercept) => {
        expect((await intercept.fetch()).status()).toBe(200);
        await intercept.abort();
      },
      { times: 1 },
    );
    await dialog.getByRole('button', { name: 'Confirmă preluarea', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Verifică tentativa de livrare', exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Marchează livrarea nereușită', exact: true }),
    ).toBeDisabled();
    const saved = await page.evaluate(() =>
      Object.entries(sessionStorage)
        .filter(([key]) => key.startsWith('pos.courier-transition:'))
        .map(([, value]) => value)
        .join(''),
    );
    expect(saved).toContain('PICKED_UP');
    expect(saved).not.toContain('version');
    expect(saved).not.toContain('reason');
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Livrările mele');
    await page.getByRole('button', { name: 'Verifică tentativa de livrare', exact: true }).click();
    await expect(page.getByText('Preluată', { exact: true })).toBeVisible();
    await open();
    await page.route(route, (intercept) => intercept.abort(), { times: 1 });
    await dialog.getByRole('button', { name: 'Pornește livrarea', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Verifică tentativa de livrare', exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Verifică tentativa de livrare', exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText('Tentativa de schimbare a livrării a fost retrasă.', { exact: true }),
    ).toBeVisible();
    await open();
    await dialog.getByRole('button', { name: 'Pornește livrarea', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('În livrare', { exact: true })).toBeVisible();
    await open();
    await dialog.getByRole('button', { name: 'Marchează livrarea nereușită', exact: true }).click();
    await dialog
      .getByLabel('Motivul livrării nereușite', { exact: true })
      .fill('Client indisponibil');
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
    await dialog.getByRole('button', { name: 'Confirmă livrarea nereușită', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Reîncearcă aceeași schimbare de livrare', exact: true }),
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
      .getByRole('button', { name: 'Reîncearcă aceeași schimbare de livrare', exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Detalii livrare', exact: true })).toHaveCount(0);
    await page.getByLabel('Lista livrărilor', { exact: true }).selectOption('HISTORY');
    await expect(page.getByText('Livrare nereușită', { exact: true })).toBeVisible();
  } finally {
    await f.dispose();
  }
});
