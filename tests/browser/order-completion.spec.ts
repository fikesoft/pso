import { completePacking } from './support/complete-packing';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('comandă: finalizare fără încasare recuperată după răspuns pierdut și consum unic', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser);
  const { admin, location } = f;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    const materialResponse = await api(admin, '/inventory/items', {
      name: 'Ambalaj finalizare',
      sku: randomUUID(),
      kind: 'PACKAGING',
      unit: 'PCS',
    });
    expect(materialResponse.status()).toBe(200);
    const material = (await materialResponse.json()).item;
    expect(
      (
        await api(admin, `/inventory/recipes/${product.id}`, {
          expectedVersion: 0,
          requestKey: randomUUID(),
          reason: 'Consum la finalizare independentă',
          components: [
            {
              inventoryItemId: material.id,
              purpose: 'PACKAGING',
              quantityPerUnit: '2',
              serviceTypes: ['PICKUP'],
            },
          ],
        })
      ).status(),
    ).toBe(200);
    const response = await api(admin, '/orders', {
      locationId: location.id,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: '1' }],
    });
    expect(response.status()).toBe(200);
    const order = (await response.json()).order;
    const path = `/orders/${order.id}`;
    const sent = await api(admin, `${path}/send`, { version: 1, requestKey: randomUUID() });
    expect(sent.status()).toBe(200);
    const ticket = (await sent.json()).ticket;
    for (const [index, status] of ['PREPARING', 'READY'].entries()) {
      expect(
        (
          await api(admin, `/kitchen/tickets/${ticket.id}`, { version: index + 1, status }, 'PATCH')
        ).status(),
      ).toBe(200);
    }
    await completePacking(admin, order.id);
    const stockPath = `/inventory/items/${material.id}?locationId=${location.id}`;
    expect((await (await api(admin, stockPath)).json()).item).toMatchObject({
      balance: '0.000000',
      reservedQuantity: '2.000000',
    });
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: 'Comanda #1', exact: true });
    let originalPayload = '';
    await admin.route(`**/api/tenant${path}/complete`, async (route) => {
      originalPayload = route.request().postData()!;
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      await route.abort('failed');
    });
    await dialog.getByRole('button', { name: 'Finalizează comanda', exact: true }).click();
    await expect(dialog.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Checkout real', exact: true })).toBeDisabled();
    await admin.keyboard.press('Escape');
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    await expect(dialog.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await admin.unroute(`**/api/tenant${path}/complete`);
    const retry = admin.waitForRequest((request) => request.url().endsWith(`${path}/complete`));
    const completed = await submit(
      admin,
      `/api/tenant${path}/complete`,
      dialog.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    );
    expect((await retry).postData()).toBe(originalPayload);
    expect(completed.order).toMatchObject({ status: 'COMPLETED', checkout: null });
    await expect(
      dialog.getByText('Finalizată operațional. Nu există o încasare înregistrată.', {
        exact: true,
      }),
    ).toBeVisible();
    expect((await (await api(admin, stockPath)).json()).item).toMatchObject({
      balance: '-2.000000',
      reservedQuantity: '0.000000',
    });
    await admin.keyboard.press('Escape');
    await admin.reload();
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    await expect(
      dialog.getByText('Finalizată operațional. Nu există o încasare înregistrată.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Deschide bonul', exact: true })).toHaveCount(
      0,
    );
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('completed-unpaid-360.png'), fullPage: true });
  } finally {
    await f.dispose();
  }
});
