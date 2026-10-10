import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { navigateSection, submit } from './browser-helpers';

export async function verifyUnknownRetryRefused(
  page: Page,
  dialog: Locator,
  path: string,
  lockedField: Locator,
  originalPayload: string,
  verifyCannotClose = true,
) {
  const pattern = `**${path}`;
  await page.route(pattern, async (route) => {
    expect(route.request().postData()).toBe(originalPayload);
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Acces refuzat sintetic la reîncercare' }),
    });
  });
  try {
    await dialog.getByRole('button', { name: 'Reîncearcă cererea', exact: true }).click();
    await expect(dialog.getByText('Acces refuzat sintetic la reîncercare')).toBeVisible();
    await expect(lockedField).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    ).toBeEnabled();
    if (verifyCannotClose) {
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
    }
  } finally {
    await page.unroute(pattern);
  }
}

export async function verifyOrderCatalogRecovery(page: Page) {
  const pattern = '**/api/tenant/catalog?*';
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Catalog temporar indisponibil sintetic' }),
    }),
  );
  await navigateSection(page, 'Comenzi');
  await expect(page.getByText('Catalog temporar indisponibil sintetic')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comandă nouă', exact: true })).toBeDisabled();
  await page.unroute(pattern);
  await page.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Comandă nouă', exact: true })).toBeEnabled();
}

export async function verifyNewDraftRejected(page: Page, dialog: Locator) {
  let rejectedPayload = '';
  await page.route('**/api/tenant/orders', async (route) => {
    rejectedPayload = route.request().postData()!;
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Produs indisponibil sintetic' }),
    });
  });
  await dialog.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
  await expect(dialog.getByText('Produs indisponibil sintetic')).toBeVisible();
  await expect(dialog.getByLabel('Masa', { exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Salvează ciorna', exact: true })).toBeEnabled();
  await page.unroute('**/api/tenant/orders');
  return JSON.parse(rejectedPayload).requestKey as string;
}

export async function verifyUnknownSend(page: Page, dialog: Locator, orderId: string) {
  const path = `/api/tenant/orders/${orderId}/send`;
  let payload = '';
  await page.route(`**${path}`, async (route) => {
    payload = route.request().postData()!;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort('failed');
  });
  await dialog.getByRole('button', { name: 'Trimite la bucătărie', exact: true }).click();
  await expect(dialog.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
  await page.unroute(`**${path}`);
  await verifyUnknownRetryRefused(
    page,
    dialog,
    path,
    dialog.getByRole('button', { name: 'Reîncarcă', exact: true }),
    payload,
    false,
  );
  for (const name of ['Editează ciorna', 'Trimite la bucătărie']) {
    await expect(
      dialog.getByRole('button', { name, exact: true }).and(dialog.locator('button:enabled')),
    ).toHaveCount(0);
  }
  const retry = page.waitForRequest(
    (request) => new URL(request.url()).pathname === path && request.method() === 'POST',
  );
  const result = await submit(
    page,
    path,
    dialog.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
  );
  expect((await retry).postData()).toBe(payload);
  return result;
}
