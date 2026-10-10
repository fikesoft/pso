import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('comandă: confirmare recuperată, preparare parțială și anulare cu motiv fără dublarea efectelor', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser);
  const { admin, location } = f;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    const materialResponse = await api(admin, '/inventory/items', {
      name: 'Ambalaj E2E',
      sku: randomUUID(),
      kind: 'PACKAGING',
      unit: 'PCS',
    });
    expect(materialResponse.status()).toBe(200);
    const material = (await materialResponse.json()).item;
    const recipe = await api(admin, `/inventory/recipes/${product.id}`, {
      expectedVersion: 0,
      requestKey: randomUUID(),
      reason: 'Rețetă E2E pentru eliberarea rezervării',
      components: [
        {
          inventoryItemId: material.id,
          purpose: 'PACKAGING',
          quantityPerUnit: '1',
          serviceTypes: ['PICKUP'],
        },
      ],
    });
    expect(recipe.status()).toBe(200);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = admin.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await draft.getByRole('button', { name: /Cafea sintetică/ }).click();
    const created = await submit(
      admin,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    const path = `/api/tenant/orders/${created.order.id}`;
    const details = admin.getByRole('dialog', { name: 'Comanda #1', exact: true });
    let confirmPayload = '';
    await admin.route(`**${path}/confirm`, async (route) => {
      confirmPayload = route.request().postData()!;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    });
    await details.getByRole('button', { name: 'Confirmă fără trimitere', exact: true }).click();
    await expect(details.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await expect(
      details.getByRole('button', { name: 'Editează ciorna', exact: true }),
    ).toBeDisabled();
    await expect(
      details.getByRole('button', { name: 'Trimite la bucătărie', exact: true }),
    ).toBeDisabled();
    await admin.unroute(`**${path}/confirm`);
    const confirmRetry = admin.waitForRequest((request) =>
      request.url().endsWith(`${path}/confirm`),
    );
    const confirmed = await submit(
      admin,
      `${path}/confirm`,
      details.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    );
    expect((await confirmRetry).postData()).toBe(confirmPayload);
    expect(confirmed.order).toMatchObject({
      status: 'CONFIRMED',
      kitchenStatus: 'NOT_SENT',
      version: 2,
    });
    await expect(details).toContainText('Confirmată, încă netrimisă la bucătărie');
    await expect(details.getByRole('button', { name: 'Editează ciorna', exact: true })).toHaveCount(
      0,
    );
    await submit(
      admin,
      `${path}/send`,
      details.getByRole('button', { name: 'Trimite la bucătărie', exact: true }),
    );
    const stockPath = `/inventory/items/${material.id}?locationId=${location.id}`;
    expect((await (await api(admin, stockPath)).json()).item.reservedQuantity).toBe('1.000000');
    await admin.keyboard.press('Escape');
    await navigateSection(admin, 'Bucătărie');
    const card = admin
      .locator('article')
      .filter({ has: admin.getByRole('heading', { name: 'Comanda #1', exact: true }) });
    await card.getByRole('button', { name: 'Începe prepararea', exact: true }).click();
    await card.getByRole('button', { name: 'Marchează parțial gata', exact: true }).click();
    await expect(
      admin
        .getByRole('region', { name: 'Parțial gata', exact: true })
        .getByRole('heading', { name: 'Comanda #1', exact: true }),
    ).toBeVisible();
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('partial-kitchen-360.png'), fullPage: true });
    await card.getByRole('button', { name: 'Marchează gata', exact: true }).click();
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    await details.getByRole('button', { name: 'Anulează comanda', exact: true }).click();
    await expect(
      details.getByRole('button', { name: 'Confirmă anularea comenzii', exact: true }),
    ).toBeDisabled();
    await details
      .getByLabel('Motivul anulării', { exact: true })
      .fill('Clientul a renunțat înainte de predare');
    let cancelPayload = '';
    await admin.route(`**${path}/cancel`, async (route) => {
      cancelPayload = route.request().postData()!;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    });
    await details.getByRole('button', { name: 'Confirmă anularea comenzii', exact: true }).click();
    await expect(details.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await expect(details.getByLabel('Motivul anulării', { exact: true })).toBeDisabled();
    await admin.keyboard.press('Escape');
    await expect(details).not.toBeVisible();
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    await expect(details.getByLabel('Motivul anulării', { exact: true })).toHaveValue(
      'Clientul a renunțat înainte de predare',
    );
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('cancel-uncertain-360.png'), fullPage: true });
    await admin.unroute(`**${path}/cancel`);
    const cancelRetry = admin.waitForRequest((request) => request.url().endsWith(`${path}/cancel`));
    const cancelled = await submit(
      admin,
      `${path}/cancel`,
      details.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    );
    expect((await cancelRetry).postData()).toBe(cancelPayload);
    expect(cancelled.order.status).toBe('CANCELLED');
    await expect(details).toContainText('Anulată');
    expect((await (await api(admin, stockPath)).json()).item).toMatchObject({
      balance: '0.000000',
      reservedQuantity: '0.000000',
    });
    await admin.keyboard.press('Escape');
    await navigateSection(admin, 'Bucătărie');
    await expect(
      admin.getByText('Nu sunt tichete pentru bucătărie', { exact: true }),
    ).toBeVisible();
  } finally {
    await f.dispose();
  }
});
