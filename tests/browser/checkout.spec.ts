import { completePacking } from './support/complete-packing';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Order } from '../../packages/contracts/src';
import { operationsFixture } from './support/operations-fixture';
import { verifyUnknownRetryRefused } from './support/recovery';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';
async function readyOrder(page: Page, locationId: string, productId: string) {
  const created = await api(page, '/orders', {
    locationId,
    serviceType: 'TAKEAWAY',
    items: [{ productId, quantity: '1' }],
    requestKey: randomUUID(),
  });
  expect(created.status()).toBe(200);
  const { order } = await created.json();
  const sent = await api(page, `/orders/${order.id}/send`, {
    version: order.version,
    requestKey: randomUUID(),
  });
  expect(sent.status()).toBe(200);
  let { ticket } = await sent.json();
  for (const status of ['PREPARING', 'READY']) {
    const changed = await api(
      page,
      `/kitchen/tickets/${ticket.id}`,
      { version: ticket.version, status },
      'PATCH',
    );
    expect(changed.status()).toBe(200);
    ticket = (await changed.json()).ticket;
  }
  return completePacking(page, order.id);
}
async function openOrder(page: Page, number: number) {
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: `Comanda #${number}`, exact: true }) })
    .getByRole('button', { name: 'Deschide comanda' })
    .click();
}
async function verifyDraftClosesWhileLoading(page: Page, locationId: string, productId: string) {
  const created = await api(page, '/orders', {
    locationId,
    serviceType: 'TAKEAWAY',
    items: [{ productId, quantity: '1' }],
    requestKey: randomUUID(),
  });
  expect(created.status()).toBe(200);
  const { order } = await created.json();
  const pattern = `**/api/tenant/orders/${order.id}/receipt`;
  let release = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(pattern, async (route) => {
    await delayed;
    await route.continue();
  });
  try {
    await navigateSection(page, 'Comenzi');
    const reading = page.waitForRequest((request) =>
      request.url().endsWith(`/orders/${order.id}/receipt`),
    );
    await openOrder(page, order.number);
    await reading;
    const dialog = page.getByRole('dialog', { name: `Comanda #${order.number}`, exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    const loaded = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/orders/${order.id}`) && response.request().method() === 'GET',
    );
    release();
    await (await loaded).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(dialog).not.toBeVisible();
  } finally {
    release();
    await page.unroute(pattern);
  }
}
test('checkout: bon DEMO idempotent, descărcare, numerar, card și reconciliere responsive', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const fixture = await operationsFixture(browser);
  const { admin, location } = fixture;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    await verifyDraftClosesWhileLoading(admin, location.id, product.id);
    const orders: Order[] = [];
    for (let index = 0; index < 4; index++)
      orders.push(await readyOrder(admin, location.id, product.id));
    const [demo, cash, card, stale] = orders as [Order, Order, Order, Order];
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await admin.setViewportSize({ width: 360, height: 800 });
    await openOrder(admin, demo.number);
    await admin.getByRole('button', { name: 'Bon fictiv', exact: true }).click();
    let dialog = admin.getByRole('dialog', { name: 'Bon fictiv', exact: true });
    await expect(dialog).toContainText('Aceeași comandă nu va mai putea fi încasată ulterior.');
    await dialog.getByRole('checkbox', { name: 'Confirm închiderea definitivă ca DEMO' }).check();
    let firstPayload = '';
    let committedReceiptId = '';
    let calls = 0;
    await admin.route(`**/api/tenant/orders/${demo.id}/checkout/demo`, async (route) => {
      calls++;
      firstPayload = route.request().postData()!;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committedReceiptId = (await response.json()).receipt.id;
      await route.abort('failed');
    });
    await dialog.getByRole('button', { name: 'Finalizează cu bon fictiv' }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(dialog.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    expect(calls).toBe(1);
    await expect(dialog.getByRole('checkbox')).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Anulează', exact: true })).toBeDisabled();
    await admin.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await noOverflow(admin);
    await admin.unroute(`**/api/tenant/orders/${demo.id}/checkout/demo`);
    await verifyUnknownRetryRefused(
      admin,
      dialog,
      `/api/tenant/orders/${demo.id}/checkout/demo`,
      dialog.getByRole('checkbox'),
      firstPayload,
    );
    const retryRequest = admin.waitForRequest(
      (request) =>
        request.url().endsWith(`/orders/${demo.id}/checkout/demo`) && request.method() === 'POST',
    );
    const completedDemo = await submit(
      admin,
      `/api/tenant/orders/${demo.id}/checkout/demo`,
      dialog.getByRole('button', { name: 'Reîncearcă cererea' }),
    );
    expect((await retryRequest).postData()).toBe(firstPayload);
    expect(completedDemo.receipt.id).toBe(committedReceiptId);
    expect(completedDemo.receipt.paymentId).toBeNull();
    expect(completedDemo.order).toMatchObject({ status: 'COMPLETED', checkout: { mode: 'DEMO' } });
    dialog = admin.getByRole('dialog', { name: 'Bon fictiv · DEMO', exact: true });
    await expect(dialog.getByLabel('Document', { exact: true })).toContainText(
      'DEMO — fără încasare.',
    );
    const downloadPromise = admin.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Descarcă TXT' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`receipt-${committedReceiptId}.txt`);
    const output = info.outputPath('receipt-demo.txt');
    await download.saveAs(output);
    expect(await readFile(output, 'utf8')).toContain('Bon fictiv · DEMO\nDOCUMENT NEFISCAL');
    await admin.emulateMedia({ media: 'print' });
    await expect(dialog.locator('.checkout-receipt')).toBeVisible();
    await expect(admin.locator('main')).not.toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Descarcă TXT' })).not.toBeVisible();
    await admin.pdf({ path: info.outputPath('receipt-demo.pdf'), format: 'A5' });
    await admin.emulateMedia({ media: 'screen' });
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('receipt-demo-360.png'), fullPage: true });
    await admin.reload();
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(admin, 'Comenzi');
    await expect(admin.getByText('DEMO · fără încasare', { exact: true })).toBeVisible();
    await openOrder(admin, demo.number);
    await expect(dialog).toBeVisible();
    expect((await (await api(admin, `/orders/${demo.id}/receipt`)).json()).receipt).toEqual(
      completedDemo.receipt,
    );
    await admin.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    const shift = await fixture.cashShift();
    await openOrder(admin, cash.number);
    await admin.getByRole('button', { name: 'Checkout real', exact: true }).click();
    dialog = admin.getByRole('dialog', { name: 'Checkout real', exact: true });
    await dialog.getByRole('button', { name: 'Reîncarcă turele', exact: true }).click();
    await dialog.getByLabel('Tura proprie pentru operație', { exact: true }).selectOption(shift.id);
    await dialog.getByLabel('Numerar primit (MDL)').fill('20,00');
    await expect(dialog.getByLabel('Numerar primit (MDL)')).toHaveValue('20.00');
    await dialog.getByRole('checkbox', { name: 'Confirm că plata a fost deja primită' }).check();
    const cashResult = await submit(
      admin,
      `/api/tenant/orders/${cash.id}/checkout/manual`,
      dialog.getByRole('button', { name: 'Înregistrează încasarea' }),
    );
    expect(cashResult.receipt).toMatchObject({
      mode: 'MANUAL',
      method: 'CASH',
      total: '10.01',
      receivedAmount: '20.00',
      changeAmount: '9.99',
    });
    expect(cashResult.receipt.paymentId).toBeTruthy();
    dialog = admin.getByRole('dialog', { name: 'Dovadă de încasare · nefiscală', exact: true });
    await expect(dialog.getByLabel('Document', { exact: true })).toContainText('Rest: 9.99 MDL');
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('receipt-cash-360.png'), fullPage: true });
    await admin.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    await openOrder(admin, card.number);
    await admin.getByRole('button', { name: 'Checkout real', exact: true }).click();
    dialog = admin.getByRole('dialog', { name: 'Checkout real', exact: true });
    await dialog.getByLabel('Tura proprie pentru operație', { exact: true }).selectOption(shift.id);
    await dialog.getByLabel('Metoda de încasare').selectOption('CARD');
    await expect(dialog.getByLabel('Numerar primit (MDL)')).toHaveCount(0);
    await dialog.getByRole('checkbox', { name: 'Confirm că plata a fost deja primită' }).check();
    const cardRequest = admin.waitForRequest(
      (request) =>
        request.url().endsWith(`/orders/${card.id}/checkout/manual`) && request.method() === 'POST',
    );
    const cardResult = await submit(
      admin,
      `/api/tenant/orders/${card.id}/checkout/manual`,
      dialog.getByRole('button', { name: 'Înregistrează încasarea' }),
    );
    expect((await cardRequest).postDataJSON()).not.toHaveProperty('receivedAmount');
    expect(cardResult.receipt).toMatchObject({
      method: 'CARD',
      receivedAmount: '10.01',
      changeAmount: '0.00',
    });
    dialog = admin.getByRole('dialog', { name: 'Dovadă de încasare · nefiscală', exact: true });
    await expect(dialog).toBeVisible();
    await admin.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    await openOrder(admin, stale.number);
    await admin.getByRole('button', { name: 'Bon fictiv', exact: true }).click();
    dialog = admin.getByRole('dialog', { name: 'Bon fictiv', exact: true });
    const concurrent = await api(admin, `/orders/${stale.id}/checkout/demo`, {
      version: stale.version,
      requestKey: randomUUID(),
    });
    expect(concurrent.status()).toBe(200);
    await dialog.getByRole('checkbox', { name: 'Confirm închiderea definitivă ca DEMO' }).check();
    const conflict = admin.waitForResponse(
      (response) =>
        response.url().endsWith(`/orders/${stale.id}/checkout/demo`) &&
        response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Finalizează cu bon fictiv' }).click();
    expect((await conflict).status()).toBe(409);
    await expect(dialog.getByText(/Datele s-au schimbat/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await expect(
      admin.getByRole('dialog', { name: 'Bon fictiv · DEMO', exact: true }),
    ).toBeVisible();
    await noOverflow(admin);
  } finally {
    await fixture.dispose();
  }
});
