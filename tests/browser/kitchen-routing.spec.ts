import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow } from './support/browser-helpers';
test('rutare produse: atribuire recuperată după reload, eliminare și istoric păstrat', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser),
    page = f.admin;
  try {
    const locationId = f.location.id;
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(locationId);
    const product = await createOperationalProduct(page);
    const { station } = await (
      await api(page, '/kitchen-stations', {
        locationId,
        requestKey: randomUUID(),
        code: 'BAR',
        name: 'Bar pentru rutare',
        sortOrder: 1,
      })
    ).json();
    await navigateSection(page, 'Bucătărie');
    await page.getByRole('button', { name: 'Rutarea produselor', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Rutarea produselor', exact: true });
    await panel.getByLabel('Caută produs sau cod', { exact: true }).fill('CAFEA-E2E');
    await panel.getByRole('button', { name: 'Caută', exact: true }).click();
    await panel.getByRole('button', { name: 'Atribuie stația', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Atribuie stația', exact: true });
    await dialog.getByLabel('Atribuie stația', { exact: true }).selectOption(station.id);
    await page.setViewportSize({ width: 360, height: 800 });
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('routing-form-360.png'), fullPage: true });
    await page.route(
      '**/api/tenant/kitchen-routing',
      async (route) => {
        if (route.request().method() !== 'PUT') return route.continue();
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('failed');
      },
      { times: 1 },
    );
    await dialog.getByRole('button', { name: 'Salvează atribuirea', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    ).toBeVisible();
    await expect(dialog.getByLabel('Atribuie stația', { exact: true })).toBeDisabled();
    await page.reload();
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(locationId);
    await navigateSection(page, 'Bucătărie');
    await page.getByRole('button', { name: 'Rutarea produselor', exact: true }).click();
    await expect(
      panel.getByRole('button', { name: 'Atribuie stația', exact: true }),
    ).toBeDisabled();
    await panel.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }).click();
    await expect(
      panel.getByText('Atribuirea curentă: BAR · Bar pentru rutare', { exact: true }),
    ).toBeVisible();
    const routingPath = `/kitchen-routing?locationId=${locationId}&productId=${product.id}`;
    expect((await (await api(page, routingPath)).json()).routing.version).toBe(1);
    async function send() {
      const { order } = await (
        await api(page, '/orders', {
          locationId,
          serviceType: 'PICKUP',
          requestKey: randomUUID(),
          items: [{ productId: product.id, quantity: '1' }],
        })
      ).json();
      const response = await api(page, `/orders/${order.id}/send`, {
        version: order.version,
        requestKey: randomUUID(),
      });
      expect(response.status()).toBe(200);
      return (await response.json()).ticket;
    }
    const historical = await send();
    expect(historical.batches[0].station.id).toBe(station.id);
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`routing-${width}.png`), fullPage: true });
    }
    await panel.getByRole('button', { name: 'Atribuie stația', exact: true }).click();
    await dialog.getByLabel('Atribuie stația', { exact: true }).selectOption('');
    await dialog.getByRole('button', { name: 'Salvează atribuirea', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(panel.getByText('Atribuirea curentă: Neatribuit', { exact: true })).toBeVisible();
    expect((await (await api(page, routingPath)).json()).routing.version).toBe(2);
    const next = await send();
    expect(next.batches[0].station).toBeNull();
    const board = await (await api(page, `/kitchen/tickets?locationId=${locationId}`)).json();
    expect(
      board.tickets.find((ticket: { id: string }) => ticket.id === historical.id).batches,
    ).toEqual(historical.batches);
  } finally {
    await f.dispose();
  }
});
