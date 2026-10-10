import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { orderRealtimeFixture } from './order-realtime-setup';
import { api, noOverflow } from './support/browser-helpers';
test('rețeta KDS: cantități istorice, lipsă componente, recuperare eroare și mobil/TV', async ({
  browser,
}, info) => {
  const f = await orderRealtimeFixture(browser, 'kitchen');
  try {
    const material = await api(f.admin, '/inventory/items', {
      name: 'Ingredient KDS',
      sku: 'KDS-RECIPE',
      kind: 'INGREDIENT',
      unit: 'G',
    });
    expect(material.status()).toBe(200);
    const { item } = await material.json();
    const recipePath = `/inventory/recipes/${f.product.id}`;
    const published = await api(f.admin, recipePath, {
      expectedVersion: 0,
      requestKey: randomUUID(),
      reason: 'Rețetă KDS',
      components: [
        {
          inventoryItemId: item.id,
          purpose: 'MAIN',
          quantityPerUnit: '2.333',
          serviceTypes: ['PICKUP'],
        },
      ],
    });
    expect(published.status()).toBe(200);
    const create = async () => {
      const response = await api(f.admin, '/orders', {
        locationId: f.location.id,
        serviceType: 'PICKUP',
        requestKey: randomUUID(),
        items: [{ productId: f.product.id, quantity: '1.234' }],
      });
      expect(response.status()).toBe(200);
      const { order } = await response.json();
      const sent = await api(f.admin, `/orders/${order.id}/send`, {
        version: order.version,
        requestKey: randomUUID(),
      });
      expect(sent.status()).toBe(200);
      return (await sent.json()).ticket;
    };
    const ticket = await create();
    const card = f.operator
      .locator('article')
      .filter({ has: f.operator.getByRole('heading', { name: 'Comanda #1', exact: true }) });
    const button = card.getByRole('button', { name: 'Vezi rețeta: Cafea sintetică', exact: true });
    const path = `/api/tenant/kitchen/tickets/${ticket.id}/items/${ticket.items[0].id}/recipe`;
    await f.operator.route(`**${path}`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Rețeta nu poate fi citită acum' }),
      }),
    );
    await button.click();
    const dialog = f.operator.getByRole('dialog', {
      name: 'Rețeta de preparare · Cafea sintetică',
      exact: true,
    });
    await expect(dialog.getByText('Rețeta nu poate fi citită acum', { exact: true })).toBeVisible();
    await f.operator.unroute(`**${path}`);
    await dialog.getByRole('button', { name: 'Reîncarcă rețeta', exact: true }).click();
    await expect(dialog.getByText('2.878922 g', { exact: true })).toBeVisible();
    await expect(dialog.getByText('2.333 g', { exact: true })).toBeVisible();
    for (const width of [360, 1920]) {
      await f.operator.setViewportSize({ width, height: width === 360 ? 800 : 1080 });
      await noOverflow(f.operator);
      await f.operator.screenshot({
        path: info.outputPath(`kitchen-recipe-${width}.png`),
        fullPage: true,
      });
    }
    await f.operator.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(button).toBeFocused();
    const replacement = await api(f.admin, recipePath, {
      expectedVersion: 1,
      requestKey: randomUUID(),
      reason: 'Rețetă goală',
      components: [],
    });
    expect(replacement.status()).toBe(200);
    await button.click();
    await expect(dialog.getByText('2.878922 g', { exact: true })).toBeVisible();
    await f.operator.keyboard.press('Escape');
    await create();
    const second = f.operator
      .locator('article')
      .filter({ has: f.operator.getByRole('heading', { name: 'Comanda #2', exact: true }) });
    await second.getByRole('button', { name: 'Vezi rețeta: Cafea sintetică', exact: true }).click();
    await expect(
      dialog.getByText(
        'Nu au fost înregistrate componente de rețetă pentru acest articol și acest tip de servire.',
        { exact: true },
      ),
    ).toBeVisible();
  } finally {
    await f.dispose();
  }
});
