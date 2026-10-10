import { test, expect } from '@playwright/test';
import { cashierFixture, openCashierOrder } from './cashier-setup';
import { noOverflow, submit } from './support/browser-helpers';

test('casier: checkoutul eligibil păstrează dovada nefiscală și DEMO fără încasare reală', async ({
  browser,
}, info) => {
  const f = await cashierFixture(browser);
  try {
    const manual = await f.ready();
    const demo = await f.ready();
    const { page } = await f.login('operator');
    const shift = await f.cashShift(page);
    const detail = await openCashierOrder(page, manual.number);
    await detail.getByRole('button', { name: 'Checkout real', exact: true }).click();
    const checkout = page.getByRole('dialog', { name: 'Checkout real', exact: true });
    await checkout
      .getByLabel('Tura proprie pentru operație', { exact: true })
      .selectOption(shift.id);
    await checkout.getByLabel('Numerar primit (MDL)').fill('50');
    await checkout.getByRole('checkbox', { name: 'Confirm că plata a fost deja primită' }).check();
    const paid = await submit(
      page,
      `/api/tenant/orders/${manual.id}/checkout/manual`,
      checkout.getByRole('button', { name: 'Înregistrează încasarea', exact: true }),
    );
    expect(paid.receipt).toMatchObject({
      mode: 'MANUAL',
      isFiscal: false,
      total: '30.00',
      receivedAmount: '50.00',
      changeAmount: '20.00',
    });
    expect(paid.receipt.paymentId).toBeTruthy();
    const receipt = page.getByRole('dialog', {
      name: 'Dovadă de încasare · nefiscală',
      exact: true,
    });
    await expect(receipt.getByLabel('Document', { exact: true })).toContainText(
      'DOCUMENT NEFISCAL',
    );
    await page.setViewportSize({ width: 360, height: 800 });
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('cashier-receipt-360.png'), fullPage: true });
    await page.keyboard.press('Escape');
    const shiftPath = `/cash-shifts/${shift.id}?locationId=${f.location.id}`;
    const beforeDemo = await f.request(shiftPath);
    const demoDetail = await openCashierOrder(page, demo.number);
    await demoDetail.getByRole('button', { name: 'Bon fictiv', exact: true }).click();
    const demoForm = page.getByRole('dialog', { name: 'Bon fictiv', exact: true });
    await expect(demoForm.getByLabel('Tura proprie pentru operație', { exact: true })).toHaveCount(
      0,
    );
    await expect(demoForm).toContainText('Aceeași comandă nu va mai putea fi încasată ulterior.');
    await demoForm.getByRole('checkbox', { name: 'Confirm închiderea definitivă ca DEMO' }).check();
    const demoResult = await submit(
      page,
      `/api/tenant/orders/${demo.id}/checkout/demo`,
      demoForm.getByRole('button', { name: 'Finalizează cu bon fictiv', exact: true }),
    );
    expect(demoResult.receipt).toMatchObject({ mode: 'DEMO', isFiscal: false, paymentId: null });
    const demoReceipt = page.getByRole('dialog', { name: 'Bon fictiv · DEMO', exact: true });
    await expect(demoReceipt.getByLabel('Document', { exact: true })).toContainText(
      'DEMO — fără încasare.',
    );
    expect((await f.request(`/orders/${demo.id}/payments`)).payments).toEqual([]);
    expect(await f.request(shiftPath)).toEqual(beforeDemo);
    await noOverflow(page);
  } finally {
    await f.dispose();
  }
});
