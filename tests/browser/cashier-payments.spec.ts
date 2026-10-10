import { test, expect } from '@playwright/test';
import { cashierFixture, openCashierOrder } from './cashier-setup';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('casier: PIN de încasare fără creare, numerar cu rest și rambursare prin drept distinct', async ({
  browser,
}, info) => {
  const f = await cashierFixture(browser);
  try {
    const order = await f.create();
    await f.command(order.id, 'confirm');
    const collector = await f.login('collector');
    const { page, reads } = collector;
    const collectorShift = await f.cashShift(page, f.location.id, '0');
    const detail = await openCashierOrder(page, order.number);
    await expect(
      page.getByRole('region', { name: 'Catalog casier', includeHidden: true }),
    ).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Bon fictiv', exact: true })).toHaveCount(0);
    const financial = detail.getByRole('region', { name: 'Plăți și rambursări', exact: true });
    await financial.getByRole('button', { name: 'Încasează o tranșă', exact: true }).click();
    await financial
      .getByLabel('Tura proprie pentru operație', { exact: true })
      .selectOption(collectorShift.id);
    await financial.getByLabel('Metoda tranșei', { exact: true }).selectOption('CASH');
    await financial.getByLabel('Tranșă numerar (MDL)', { exact: true }).fill('30');
    await financial.getByLabel('Numerar primit (MDL)', { exact: true }).fill('50');
    await expect(
      financial.getByRole('button', { name: 'Înregistrează tranșa', exact: true }),
    ).toBeDisabled();
    await financial
      .getByLabel('Confirm că aceste sume au fost deja primite', { exact: true })
      .check();
    const paid = await submit(
      page,
      `/api/tenant/orders/${order.id}/payments`,
      financial.getByRole('button', { name: 'Înregistrează tranșa', exact: true }),
    );
    expect(paid.order).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      checkout: null,
    });
    await financial.getByText('Încasări originale', { exact: true }).click();
    const cash = financial.getByRole('article', {
      name: 'Încasare Numerar · 30.00 MDL',
      exact: true,
    });
    await expect(cash).toContainText('Rest numerar: 20.00 MDL');
    await expect(financial.getByRole('button', { name: 'Rambursează', exact: true })).toHaveCount(
      0,
    );
    expect(
      reads.filter(
        (path) =>
          path.includes('/catalog/') || path.endsWith('/search') || path.endsWith('/creators'),
      ),
    ).toEqual([]);
    const ledger = await f.request(`/orders/${order.id}/payments`);
    expect(ledger.payments).toHaveLength(1);
    expect(ledger.payments[0]).toMatchObject({
      amount: '30.00',
      receivedAmount: '50.00',
      changeAmount: '20.00',
    });
    expect((await api(f.admin, `/orders/${order.id}/receipt`)).status()).toBe(404);
    await page.setViewportSize({ width: 360, height: 800 });
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('cashier-cash-360.png'), fullPage: true });

    const refunder = await f.login('refunder');
    const refundShift = await f.cashShift(refunder.page, f.location.id, '5');
    expect(refundShift.id).not.toBe(collectorShift.id);
    const refundDetail = await openCashierOrder(refunder.page, order.number);
    const refundPanel = refundDetail.getByRole('region', {
      name: 'Plăți și rambursări',
      exact: true,
    });
    await expect(
      refundPanel.getByRole('button', { name: 'Încasează o tranșă', exact: true }),
    ).toHaveCount(0);
    await refundPanel.getByText('Încasări originale', { exact: true }).click();
    await refundPanel.getByRole('button', { name: 'Rambursează', exact: true }).click();
    await refundPanel
      .getByLabel('Tura proprie pentru operație', { exact: true })
      .selectOption(refundShift.id);
    await refundPanel.getByLabel('Suma rambursată (MDL)', { exact: true }).fill('5');
    await refundPanel
      .getByLabel('Motivul rambursării', { exact: true })
      .fill('Retur casier confirmat');
    await refundPanel
      .getByLabel('Confirm că suma a fost deja restituită prin metoda plății originale', {
        exact: true,
      })
      .check();
    const refunded = await submit(
      refunder.page,
      `/api/tenant/orders/${order.id}/refunds`,
      refundPanel.getByRole('button', { name: 'Înregistrează rambursarea', exact: true }),
    );
    expect(refunded.order.paymentSummary.netPaidAmount).toBe('25.00');
    const operations = await f.request(`/orders/${order.id}/payment-operations`);
    expect(
      operations.operations.filter((operation: { kind: string }) => operation.kind === 'REFUND'),
    ).toHaveLength(1);
    await refunder.page.keyboard.press('Escape');
    await navigateSection(refunder.page, 'Comenzi');
    await expect(
      refunder.page.getByRole('heading', { name: 'Comenzi', exact: true }),
    ).toBeVisible();
  } finally {
    await f.dispose();
  }
});
