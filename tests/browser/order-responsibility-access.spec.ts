import { test, expect } from '@playwright/test';
import {
  responsibilitiesFixture,
  openResponsibility,
  responsibilityForm,
  responsibilityPointers,
  responsibilityQueue,
} from './order-responsibilities-setup';
import { navigateSection, submit } from './support/browser-helpers';

test('responsabilitate acces:403 la pagina2 elimină comenzile afișate', async ({ browser }) => {
  const f = await responsibilitiesFixture(browser);
  try {
    const page = await f.login('outgoing');
    await f.order(false, '10');
    await f.order(false, '20');
    await page.route('**/api/tenant/order-responsibilities?**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('cursor'))
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'REQUEST_REJECTED',
            error: 'Citirea responsabilităților a fost retrasă',
          }),
        });
      url.searchParams.set('limit', '1');
      await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
    });
    await navigateSection(page, 'Case');
    const queue = responsibilityQueue(page);
    await expect(queue.getByRole('article')).toHaveCount(1);
    await queue
      .getByRole('button', { name: 'Mai multe comenzi cu responsabilitate', exact: true })
      .click();
    await expect(
      queue.getByText('Citirea responsabilităților a fost retrasă', { exact: true }),
    ).toBeVisible();
    await expect(queue.getByRole('article')).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});

test('responsabilitate confirmată: eșecul recitirii după ASSIGN nu reface pointerul incert', async ({
  browser,
}) => {
  const f = await responsibilitiesFixture(browser);
  try {
    const page = await f.login('outgoing');
    const { shift } = await f.open(page, '0');
    const order = await f.order(false, '20');
    await openResponsibility(page, order.number, shift.id);
    const form = await responsibilityForm(page, 'ASSIGN');
    await page.route(`**/api/tenant/orders/${order.id}/responsibility?**`, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'INTERNAL_ERROR',
          error: 'Responsabilitatea nu poate fi recitită',
        }),
      }),
    );
    const saved = await submit(
      page,
      `/api/tenant/orders/${order.id}/responsibility-commands`,
      form.submit,
    );
    expect(saved.event.resultState).toBe('ASSIGNED');
    await expect(
      form.detail.getByText('Responsabilitatea nu poate fi recitită', { exact: true }),
    ).toBeVisible();
    expect(await responsibilityPointers(page)).toEqual([]);
    await expect(
      form.detail.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    ).toHaveCount(0);
    await page.unroute(`**/api/tenant/orders/${order.id}/responsibility?**`);
    expect((await f.responsibility(order.id)).responsibility.state).toBe('ASSIGNED');
  } finally {
    await f.dispose();
  }
});

test('responsabilitate guard invers: plata incertă împiedică deschiderea unei asumări și păstrează corpul financiar', async ({
  browser,
}) => {
  const f = await responsibilitiesFixture(browser);
  try {
    const page = await f.login('outgoing');
    const { shift } = await f.open(page, '0');
    const order = await f.order(false, '20');
    const detail = await openResponsibility(page, order.number, shift.id);
    const payments = detail.getByRole('region', { name: 'Plăți și rambursări', exact: true });
    await payments.getByRole('button', { name: 'Încasează o tranșă', exact: true }).click();
    await payments
      .getByLabel('Tura proprie pentru operație', { exact: true })
      .selectOption(shift.id);
    await payments.getByLabel('Metoda tranșei', { exact: true }).selectOption('CARD');
    await payments.getByLabel('Tranșă card (MDL)', { exact: true }).fill('5');
    await payments
      .getByLabel('Confirm că aceste sume au fost deja primite', { exact: true })
      .check();
    const path = `/api/tenant/orders/${order.id}/payments`;
    let frozen = '';
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      frozen = route.request().postData()!;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    const failed = page.waitForEvent(
      'requestfailed',
      (request) => new URL(request.url()).pathname === path && request.method() === 'POST',
    );
    await payments.getByRole('button', { name: 'Înregistrează tranșa', exact: true }).click();
    await failed;
    const panel = detail.getByRole('region', { name: 'Responsabilitatea comenzilor', exact: true });
    await expect(
      panel.getByRole('button', { name: 'Asumă în tura mea', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(detail).toBeVisible();
    expect(await responsibilityPointers(page)).toEqual([]);
    await page.unroute(`**${path}`);
    const retry = page.waitForRequest(
      (request) => new URL(request.url()).pathname === path && request.method() === 'POST',
    );
    await submit(
      page,
      path,
      payments.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    );
    expect((await retry).postData()).toBe(frozen);
    expect((await f.history(order.id)).events).toEqual([]);
  } finally {
    await f.dispose();
  }
});
