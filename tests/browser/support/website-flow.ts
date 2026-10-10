import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { api, navigateSection, submit } from './browser-helpers';

export async function connectWebsite(page: Page) {
  await navigateSection(page, 'Livrări website');
  await page.getByRole('button', { name: 'Conexiune nouă', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Conexiune nouă', exact: true });
  await dialog.getByLabel('Numele conexiunii').fill('Website sintetic');
  const { connection } = await submit(
    page,
    '/api/tenant/website/connections',
    dialog.getByRole('button', { name: 'Creează conexiunea', exact: true }),
  );
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Generează cheie API', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Cheie API nouă', exact: true });
  await dialog.getByLabel('Numele cheii').fill('Backend local sintetic');
  const issued = await submit(
    page,
    `/api/tenant/website/connections/${connection.id}/keys`,
    dialog.getByRole('button', { name: 'Generează cheie API', exact: true }),
  );
  dialog = page.getByRole('dialog', { name: 'Cheie API generată', exact: true });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Am păstrat cheia în siguranță', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.content()).not.toContain(issued.apiKey);
  return { connection, ...issued } as {
    connection: { id: string };
    key: { id: string };
    apiKey: string;
  };
}
export async function websitePackaging(page: Page, locationId: string, productId: string) {
  const created = await api(page, '/inventory/items', {
    sku: 'WEBSITE-BOX',
    name: 'Cutie website sintetică',
    kind: 'PACKAGING',
    unit: 'PCS',
  });
  expect(created.status()).toBe(200);
  const { item } = await created.json();
  expect(
    (
      await api(page, '/inventory/documents', {
        locationId,
        inventoryItemId: item.id,
        kind: 'RECEIPT',
        quantity: '5',
        reason: 'Stoc website sintetic',
        requestKey: randomUUID(),
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await api(page, `/inventory/recipes/${productId}`, {
        expectedVersion: 0,
        requestKey: randomUUID(),
        reason: 'Ambalaj pentru livrare website',
        components: [
          {
            inventoryItemId: item.id,
            purpose: 'PACKAGING',
            quantityPerUnit: '1',
            serviceTypes: ['DELIVERY'],
          },
        ],
      })
    ).status(),
  ).toBe(200);
  return item.id as string;
}
export async function openWebsiteOrder(page: Page, externalOrderId: string) {
  await page.getByRole('button', { name: 'Reîncarcă comenzile website', exact: true }).click();
  await page
    .getByRole('article')
    .filter({ hasText: externalOrderId })
    .getByRole('button', { name: 'Detalii comandă website', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Detalii comandă website', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function recoverUnavailableWebsiteOrder(
  page: Page,
  dialog: Locator,
  websiteOrderId: string,
  productId: string,
  locationId: string,
) {
  const path = `/api/tenant/website/orders/${websiteOrderId}/accept`;
  await page.route(`**${path}`, (route) => route.abort('failed'));
  await dialog.getByRole('button', { name: 'Acceptă comanda', exact: true }).click();
  await expect(dialog.getByText(/Rezultatul nu este confirmat/)).toBeVisible();
  await page.unroute(`**${path}`);
  const catalog = await (await api(page, `/catalog?locationId=${locationId}`)).json();
  const product = catalog.products.find((entry: { id: string }) => entry.id === productId);
  expect(
    (
      await api(
        page,
        `/catalog/products/${productId}/locations/${locationId}`,
        {
          version: product.locationVersion,
          price: product.price,
          enabled: false,
        },
        'PUT',
      )
    ).status(),
  ).toBe(200);
  const unavailable = page.waitForResponse(
    (response) => response.url().endsWith(path) && response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Reîncearcă aceeași solicitare', exact: true }).click();
  const result = await unavailable;
  expect(result.status()).toBe(409);
  expect((await result.json()).code).toBe('WEBSITE_PRODUCT_UNAVAILABLE');
  await dialog.getByRole('button', { name: 'Verifică starea comenzii', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Respinge comanda', exact: true })).toBeEnabled();
  await expect(dialog.getByText(/Rezultatul nu este confirmat/)).toHaveCount(0);
  const current = await (await api(page, `/website/orders/${websiteOrderId}`)).json();
  expect(current.websiteOrder).toMatchObject({ status: 'AWAITING_ACCEPTANCE', orderId: null });
}
