import { test, expect } from '@playwright/test';
import { createDeliverySandbox } from '../../scripts/delivery-sandbox/model/server';
import { close, listen } from '../support/storefront-fixture';
import { localOnly } from './support/browser-helpers';

test('website păstrează produsele și coșul când actualizarea live schimbă marginile paginilor', async ({
  browser,
}) => {
  const context = await browser.newContext();
  await localOnly(context);
  const server = createDeliverySandbox({
    apiKey: 'synthetic-local-key',
    posOrigin: 'http://127.0.0.1:4000',
  });
  const origin = await listen(server);
  let ids = [2, 4, 6, 8, 10];
  const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      // This case isolates pagination; the real stream is covered by website-modifiers.
      window.EventSource = class extends EventTarget {
        close() {}
      } as unknown as typeof EventSource;
    });
    await page.route('**/api/products*', async (route) => {
      const cursor = new URL(route.request().url()).searchParams.get('cursor');
      const available = ids.filter((value) => !cursor || id(value) > cursor);
      const selected = available.slice(0, 2);
      await route.fulfill({
        json: {
          locationCode: 'CTR',
          currency: 'MDL',
          products: selected.map((value) => ({
            productId: id(value),
            externalProductId: `SKU-${value}`,
            name: `Produs ${value}`,
            unitTotal: '1.00',
            price: '1.0000',
            modifierGroups: [],
            imageUrl: null,
          })),
          nextCursor: available.length > 2 ? id(selected.at(-1)!) : null,
        },
      });
    });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Mai multe produse', exact: true }).click();
    await page.getByRole('button', { name: 'Adaugă Produs 8 în coș', exact: true }).click();
    await expect(page.locator('#cart li')).toHaveCount(1);
    ids = [1, ...ids];
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: 'Cumpără Produs 1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cumpără Produs 8', exact: true })).toBeEnabled();
    ids = ids.filter((value) => value !== 4);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page.getByRole('button', { name: 'Cumpără Produs 4', exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cumpără Produs 8', exact: true })).toBeEnabled();
    await expect(page.locator('#cart li')).toHaveCount(1);
  } finally {
    await context.close();
    await close(server);
  }
});
