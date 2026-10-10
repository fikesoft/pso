import { test, expect } from '@playwright/test';
import { cashShiftsFixture } from './cash-shifts-setup';
import { openCashierOrder } from './cashier-setup';
import { api, submit } from './support/browser-helpers';

test('ture finanțe: selecție explicită între ture proprii și refund din sertarul altui casier', async ({
  browser,
}) => {
  const f = await cashShiftsFixture(browser);
  try {
    const page = await f.login();
    const first = await f.open(page, '0', 'Tura nefolosită');
    const selected = await f.open(page, '100', 'Tura selectată');
    const second = await f.login('second');
    const funded = await f.open(second, '5', 'Tura de rambursare');
    const order = await f.order(false, '10');
    const detail = await openCashierOrder(page, order.number);
    const panel = detail.getByRole('region', { name: 'Plăți și rambursări', exact: true });
    await panel.getByRole('button', { name: 'Încasează o tranșă', exact: true }).click();
    const selector = panel.getByLabel('Tura proprie pentru operație', { exact: true });
    await expect(selector).toHaveValue('');
    await expect(selector.locator('option')).toHaveCount(3);
    await expect(selector.locator(`option[value="${funded.shift.id}"]`)).toHaveCount(0);
    await panel.getByLabel('Metoda tranșei', { exact: true }).selectOption('CASH');
    await panel.getByLabel('Numerar primit (MDL)', { exact: true }).fill('20');
    await panel.getByLabel('Confirm că aceste sume au fost deja primite', { exact: true }).check();
    await expect(
      panel.getByRole('button', { name: 'Înregistrează tranșa', exact: true }),
    ).toBeDisabled();
    await selector.selectOption(selected.shift.id);
    const request = page.waitForRequest(
      (r) => r.url().endsWith(`/orders/${order.id}/payments`) && r.method() === 'POST',
    );
    await submit(
      page,
      `/api/tenant/orders/${order.id}/payments`,
      panel.getByRole('button', { name: 'Înregistrează tranșa', exact: true }),
    );
    expect((await request).postDataJSON().cashShiftId).toBe(selected.shift.id);
    expect((await f.detail(first.shift.id)).shift.version).toBe(1);
    expect((await f.detail(selected.shift.id)).summary).toMatchObject({
      expectedCash: '110.00',
      cashCollected: '10.00',
      paidOrderCount: 1,
    });
    await f.close(selected.shift.id, page);
    const frozen = await f.detail(selected.shift.id);
    const refundDetail = await openCashierOrder(second, order.number);
    const refundPanel = refundDetail.getByRole('region', {
      name: 'Plăți și rambursări',
      exact: true,
    });
    await refundPanel.getByText('Încasări originale', { exact: true }).click();
    await refundPanel.getByRole('button', { name: 'Rambursează', exact: true }).click();
    await refundPanel
      .getByLabel('Tura proprie pentru operație', { exact: true })
      .selectOption(funded.shift.id);
    await refundPanel.getByLabel('Suma rambursată (MDL)', { exact: true }).fill('3');
    await refundPanel
      .getByLabel('Motivul rambursării', { exact: true })
      .fill('Retur din tura curentă');
    await refundPanel
      .getByLabel('Confirm că suma a fost deja restituită prin metoda plății originale', {
        exact: true,
      })
      .check();
    await submit(
      second,
      `/api/tenant/orders/${order.id}/refunds`,
      refundPanel.getByRole('button', { name: 'Înregistrează rambursarea', exact: true }),
    );
    expect((await f.detail(funded.shift.id)).summary).toMatchObject({
      expectedCash: '2.00',
      cashRefunded: '3.00',
      refundOperationCount: 1,
    });
    expect(await f.detail(selected.shift.id)).toEqual(frozen);
    expect((await api(f.admin, `/orders/${order.id}/receipt`)).status()).toBe(404);
  } finally {
    await f.dispose();
  }
});

test('ture finanțe: închiderea după selectare refuză o plată nouă fără efect', async ({
  browser,
}) => {
  const f = await cashShiftsFixture(browser);
  try {
    const page = await f.login();
    const { shift } = await f.open(page, '0');
    const order = await f.order();
    const detail = await openCashierOrder(page, order.number);
    const panel = detail.getByRole('region', { name: 'Plăți și rambursări', exact: true });
    await panel.getByRole('button', { name: 'Încasează o tranșă', exact: true }).click();
    await panel.getByLabel('Tura proprie pentru operație', { exact: true }).selectOption(shift.id);
    await panel.getByLabel('Metoda tranșei', { exact: true }).selectOption('CARD');
    await panel.getByLabel('Confirm că aceste sume au fost deja primite', { exact: true }).check();
    await f.close(shift.id, page);
    const response = page.waitForResponse(
      (r) => r.url().endsWith(`/orders/${order.id}/payments`) && r.request().method() === 'POST',
    );
    await panel.getByRole('button', { name: 'Înregistrează tranșa', exact: true }).click();
    expect((await response).status()).toBe(409);
    expect((await (await response).json()).code).toBe('CASH_SHIFT_NOT_OPEN');
    expect((await f.request(`/orders/${order.id}/payments`)).payments).toHaveLength(0);
    expect((await f.detail(shift.id)).summary.paidOrderCount).toBe(0);
  } finally {
    await f.dispose();
  }
});
