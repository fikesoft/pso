import { test, expect } from '@playwright/test';
import { cashierFixture, openCashierOrder } from './cashier-setup';
import { api, noOverflow, submit } from './support/browser-helpers';

test('casier: plata comisă cu răspuns pierdut păstrează modalul și corpul retry după dispariția cardului activ', async ({
  browser,
}, info) => {
  const f = await cashierFixture(browser);
  try {
    const order = await f.complete();
    const { page } = await f.login('collector');
    const shift = await f.cashShift(page);
    const detail = await openCashierOrder(page, order.number);
    const panel = detail.getByRole('region', { name: 'Plăți și rambursări', exact: true });
    await panel.getByRole('button', { name: 'Încasează o tranșă', exact: true }).click();
    await panel.getByLabel('Tura proprie pentru operație', { exact: true }).selectOption(shift.id);
    await panel.getByLabel('Metoda tranșei', { exact: true }).selectOption('CARD');
    await panel.getByLabel('Confirm că aceste sume au fost deja primite', { exact: true }).check();
    const path = `/api/tenant/orders/${order.id}/payments`;
    let frozen = '';
    let commits = 0;
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      frozen = route.request().postData()!;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      commits++;
      await route.abort('failed');
    });
    await panel.getByRole('button', { name: 'Înregistrează tranșa', exact: true }).click();
    await expect(panel.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await expect(page.getByTestId('active-order-card')).toHaveCount(0);
    await expect(panel.getByLabel('Tranșă card (MDL)', { exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Închide', exact: true }).click();
    await expect(detail).toBeVisible();
    await panel.getByRole('button', { name: 'Reîncarcă situația financiară', exact: true }).click();
    await expect(panel.getByText('Plătită', { exact: true })).toBeVisible();
    await expect(panel.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await page.setViewportSize({ width: 360, height: 800 });
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('cashier-uncertain-360.png'), fullPage: true });
    await page.unroute(`**${path}`);
    const sent = page.waitForRequest(
      (request) => request.url().endsWith(path) && request.method() === 'POST',
    );
    const result = await submit(
      page,
      path,
      panel.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    );
    expect((await sent).postData()).toBe(frozen);
    expect(commits).toBe(1);
    expect(JSON.parse(frozen).cashShiftId).toBe(shift.id);
    expect(result.order).toMatchObject({
      id: order.id,
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      checkout: null,
    });
    expect((await f.request(`/orders/${order.id}/payments`)).payments).toHaveLength(1);
    expect((await f.request(`/orders/${order.id}/payment-operations`)).operations).toHaveLength(1);
    expect((await api(f.admin, `/orders/${order.id}/receipt`)).status()).toBe(404);
    await page.keyboard.press('Escape');
    await expect(detail).not.toBeVisible();
  } finally {
    await f.dispose();
  }
});
