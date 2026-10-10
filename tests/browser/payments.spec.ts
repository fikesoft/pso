import { completePacking } from './support/complete-packing';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('plăți: preplată mixtă, finalizare independentă, rambursare și retry identic pe mobil', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser);
  const { admin, location } = f;
  try {
    const shift = await f.cashShift(f.admin, f.location.id, '0');
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    const created = await api(admin, '/orders', {
      locationId: location.id,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: '2' }],
    });
    expect(created.status()).toBe(200);
    const order = (await created.json()).order;
    const path = `/api/tenant/orders/${order.id}`;
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: 'Comanda #1', exact: true });
    const financial = dialog.getByRole('region', { name: 'Plăți și rambursări', exact: true });
    await submit(
      admin,
      `${path}/confirm`,
      dialog.getByRole('button', { name: 'Confirmă fără trimitere', exact: true }),
    );
    await financial.getByRole('button', { name: 'Încasează o tranșă', exact: true }).click();
    await financial
      .getByLabel('Tura proprie pentru operație', { exact: true })
      .selectOption(shift.id);
    await financial.getByLabel('Metoda tranșei', { exact: true }).selectOption('MIXED');
    await financial.getByLabel('Tranșă numerar (MDL)', { exact: true }).fill('5,01');
    await financial.getByLabel('Numerar primit (MDL)', { exact: true }).fill('10');
    await financial.getByLabel('Tranșă card (MDL)', { exact: true }).fill('5');
    await expect(
      financial.getByRole('button', { name: 'Înregistrează tranșa', exact: true }),
    ).toBeDisabled();
    await financial
      .getByLabel('Confirm că aceste sume au fost deja primite', { exact: true })
      .check();
    let paymentPayload = '';
    await admin.route(`**${path}/payments`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      paymentPayload = route.request().postData()!;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    });
    await financial.getByRole('button', { name: 'Înregistrează tranșa', exact: true }).click();
    await expect(financial.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await expect(financial.getByLabel('Tranșă numerar (MDL)', { exact: true })).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Trimite la bucătărie', exact: true }),
    ).toBeDisabled();
    await admin.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await financial
      .getByRole('button', { name: 'Reîncarcă situația financiară', exact: true })
      .click();
    await expect(financial.getByText('Plătită parțial', { exact: true })).toBeVisible();
    await expect(financial.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('payment-uncertain-360.png'), fullPage: true });
    await admin.unroute(`**${path}/payments`);
    const retryPayment = admin.waitForRequest(
      (r) => r.url().endsWith(`${path}/payments`) && r.method() === 'POST',
    );
    const partial = await submit(
      admin,
      `${path}/payments`,
      financial.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    );
    expect((await retryPayment).postData()).toBe(paymentPayload);
    expect(partial.order).toMatchObject({
      paymentStatus: 'PARTIALLY_PAID',
      status: 'CONFIRMED',
      paymentSummary: { collectedAmount: '10.01', outstandingAmount: '10.00' },
    });
    const ledger = await api(admin, `/orders/${order.id}/payments`);
    expect((await ledger.json()).payments).toHaveLength(2);
    const sent = await submit(
      admin,
      `${path}/send`,
      dialog.getByRole('button', { name: 'Trimite la bucătărie', exact: true }),
    );
    for (const [index, status] of ['PREPARING', 'READY'].entries()) {
      expect(
        (
          await api(
            admin,
            `/kitchen/tickets/${sent.ticket.id}`,
            { version: index + 1, status },
            'PATCH',
          )
        ).status(),
      ).toBe(200);
    }
    await completePacking(admin, order.id);
    await dialog.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await submit(
      admin,
      `${path}/complete`,
      dialog.getByRole('button', { name: 'Finalizează comanda', exact: true }),
    );
    await financial.getByRole('button', { name: 'Încasează o tranșă', exact: true }).click();
    await financial
      .getByLabel('Tura proprie pentru operație', { exact: true })
      .selectOption(shift.id);
    await financial.getByLabel('Metoda tranșei', { exact: true }).selectOption('CARD');
    await expect(financial.getByLabel('Tranșă card (MDL)', { exact: true })).toHaveValue('10.00');
    await financial
      .getByLabel('Confirm că aceste sume au fost deja primite', { exact: true })
      .check();
    const paid = await submit(
      admin,
      `${path}/payments`,
      financial.getByRole('button', { name: 'Înregistrează tranșa', exact: true }),
    );
    expect(paid.order).toMatchObject({
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      checkout: null,
    });
    await financial.getByText('Încasări originale', { exact: true }).click();
    const cash = financial.getByRole('article', {
      name: 'Încasare Numerar · 5.01 MDL',
      exact: true,
    });
    await expect(cash).toContainText('Rest numerar: 4.99 MDL');
    await cash.getByRole('button', { name: 'Rambursează', exact: true }).click();
    await financial
      .getByLabel('Tura proprie pentru operație', { exact: true })
      .selectOption(shift.id);
    await financial.getByLabel('Suma rambursată (MDL)', { exact: true }).fill('1,01');
    await financial
      .getByLabel('Motivul rambursării', { exact: true })
      .fill('Retur parțial confirmat');
    await financial
      .getByLabel('Confirm că suma a fost deja restituită prin metoda plății originale', {
        exact: true,
      })
      .check();
    let refundPayload = '';
    await admin.route(`**${path}/refunds`, async (route) => {
      refundPayload = route.request().postData()!;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    });
    await financial.getByRole('button', { name: 'Înregistrează rambursarea', exact: true }).click();
    await expect(financial.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await expect(financial.getByLabel('Motivul rambursării', { exact: true })).toBeDisabled();
    await admin.unroute(`**${path}/refunds`);
    const retryRefund = admin.waitForRequest((r) => r.url().endsWith(`${path}/refunds`));
    const returned = await submit(
      admin,
      `${path}/refunds`,
      financial.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    );
    expect((await retryRefund).postData()).toBe(refundPayload);
    expect(returned.order).toMatchObject({
      status: 'COMPLETED',
      paymentStatus: 'PARTIALLY_REFUNDED',
      paymentSummary: { netPaidAmount: '19.00' },
    });
    await financial.getByText('Operațiuni financiare', { exact: true }).click();
    await expect(financial.getByText('Retur parțial confirmat', { exact: true })).toBeVisible();
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('payment-refund-360.png'), fullPage: true });
    await admin.keyboard.press('Escape');
    await admin.reload();
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    await expect(financial.getByText('Rambursată parțial', { exact: true })).toBeVisible();
    await expect(
      dialog.getByText('Finalizată operațional. Nu există o încasare înregistrată.', {
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});
