import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { orderRealtimeFixture } from './order-realtime-setup';
import { api, noOverflow, submit } from './support/browser-helpers';

test('comenzi live: rezultatul incert și plata originală supraviețuiesc resincronizării și panoului fără acces', async ({
  browser,
}, info) => {
  const f = await orderRealtimeFixture(browser);
  const { admin, operator, location, product } = f;
  try {
    const operatorShift = await f.cashShift(operator);
    const response = await api(admin, '/orders', {
      locationId: location.id,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      customer: { name: 'Client fără acces', phone: '060919293' },
      items: [{ productId: product.id, quantity: '1' }],
    });
    expect(response.status()).toBe(200);
    const order = (await response.json()).order;
    const path = `/api/tenant/orders/${order.id}`;
    await operator.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    const details = operator.getByRole('dialog', { name: 'Comanda #1', exact: true });
    await submit(
      operator,
      `${path}/confirm`,
      details.getByRole('button', { name: 'Confirmă fără trimitere', exact: true }),
    );
    const financial = details.getByRole('region', { name: 'Plăți și rambursări', exact: true });
    await financial.getByRole('button', { name: 'Încasează o tranșă', exact: true }).click();
    await financial.getByRole('button', { name: 'Reîncarcă turele', exact: true }).click();
    await financial
      .getByLabel('Tura proprie pentru operație', { exact: true })
      .selectOption(operatorShift.id);
    await financial.getByLabel('Metoda tranșei', { exact: true }).selectOption('CARD');
    await financial.getByLabel('Tranșă card (MDL)', { exact: true }).fill('1');
    await financial
      .getByLabel('Confirm că aceste sume au fost deja primite', { exact: true })
      .check();
    let originalPayload = '';
    await operator.route(`**${path}/payments`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      originalPayload = route.request().postData()!;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await financial.getByRole('button', { name: 'Înregistrează tranșa', exact: true }).click();
    await expect(financial.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await expect(financial.getByLabel('Tranșă card (MDL)', { exact: true })).toBeDisabled();
    await operator.unroute(`**${path}/payments`);
    await operator.route(`**${path}`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'REQUEST_REJECTED',
          error: 'Citirea comenzii a fost retrasă',
        }),
      });
    });
    const current = (await (await api(admin, `/orders/${order.id}`)).json()).order;
    const remote = await api(admin, `/orders/${order.id}/payments`, {
      version: current.version,
      requestKey: randomUUID(),
      cashShiftId: (await f.cashShift()).id,
      confirmed: true,
      payments: [{ method: 'CARD', amount: '1' }],
    });
    expect(remote.status()).toBe(200);
    const blocked = operator.getByRole('dialog', { name: 'Comandă indisponibilă', exact: true });
    await expect(blocked).toBeVisible();
    await expect(blocked).not.toContainText('Client fără acces');
    await expect(blocked).not.toContainText('060919293');
    await expect(blocked).not.toContainText('10.01 MDL');
    await expect(
      blocked.getByRole('region', { name: 'Cronologia comenzii', exact: true }),
    ).toHaveCount(0);
    await operator.setViewportSize({ width: 360, height: 800 });
    await noOverflow(operator);
    await operator.screenshot({
      path: info.outputPath('order-realtime-blocked-360.png'),
      fullPage: true,
    });
    // The remote event already exercised resync; pause new pushes for manual access restoration.
    await operator.evaluate(() => window.dispatchEvent(new Event('test:pause-orders')));
    const retry = operator.waitForRequest(
      (request) => request.url().endsWith(`${path}/payments`) && request.method() === 'POST',
    );
    await submit(
      operator,
      `${path}/payments`,
      blocked.getByRole('button', { name: 'Reîncearcă plata', exact: true }),
    );
    expect((await retry).postData()).toBe(originalPayload);
    expect(JSON.parse(originalPayload).cashShiftId).toBe(operatorShift.id);
    await expect(blocked).toBeVisible();
    await expect(blocked).not.toContainText('10.01 MDL');
    const ledger = await (await api(admin, `/orders/${order.id}/payments`)).json();
    expect(ledger.payments).toHaveLength(2);
    await expect(
      blocked.getByRole('button', { name: 'Verifică din nou accesul', exact: true }),
    ).toBeEnabled();
    await operator.unroute(`**${path}`);
    await blocked.getByRole('button', { name: 'Verifică din nou accesul', exact: true }).click();
    await expect(details).toBeVisible();
    await expect(details.getByRole('region', { name: 'Client', exact: true })).toContainText(
      'Client fără acces',
    );
    await expect(financial.getByText(/Răspunsul nu este confirmat/)).toHaveCount(0);
    const refreshed = (await (await api(admin, `/orders/${order.id}`)).json()).order;
    expect(refreshed).toMatchObject({ version: 4, paymentSummary: { collectedAmount: '2.00' } });
  } finally {
    await f.dispose();
  }
});
