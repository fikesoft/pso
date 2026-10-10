import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection, noOverflow } from './support/browser-helpers';
test('grupuri bucătărie: două stații, răspuns pierdut și gata numai după ambele', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser),
    page = f.admin;
  try {
    const locationId = f.location.id;
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(locationId);
    const productIds: string[] = [];
    for (const [code, name, productName] of [
      ['BAR', 'Bar sintetic', 'Cafea bar'],
      ['GRILL', 'Grătar sintetic', 'Legume grătar'],
    ]) {
      const stationResponse = await api(page, '/kitchen-stations', {
        locationId,
        requestKey: randomUUID(),
        code,
        name,
        sortOrder: 1,
      });
      expect(stationResponse.status()).toBe(200);
      const { station } = await stationResponse.json();
      const productResponse = await api(page, '/catalog/products', {
        locationId,
        name: productName,
        sku: code,
        price: '10.00',
      });
      expect(productResponse.status()).toBe(200);
      const { product } = await productResponse.json();
      productIds.push(product.id);
      expect(
        (
          await api(
            page,
            '/kitchen-routing',
            {
              locationId,
              productId: product.id,
              stationId: station.id,
              version: 0,
              requestKey: randomUUID(),
            },
            'PUT',
          )
        ).status(),
      ).toBe(200);
    }
    const draft = await api(page, '/orders', {
      locationId,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      items: productIds.map((productId) => ({
        productId,
        quantity: '1',
        note: 'Observație istorică',
      })),
    });
    expect(draft.status()).toBe(200);
    const { order } = await draft.json();
    const sent = await api(page, `/orders/${order.id}/send`, {
      version: order.version,
      requestKey: randomUUID(),
    });
    expect(sent.status()).toBe(200);
    const { ticket } = await sent.json();
    await navigateSection(page, 'Bucătărie');
    const bar = page.getByRole('region', { name: 'Bar sintetic', exact: true });
    const grill = page.getByRole('region', { name: 'Grătar sintetic', exact: true });
    await expect(bar).toContainText('Cafea bar');
    await expect(bar).not.toContainText('Legume grătar');
    await expect(grill).toContainText('Legume grătar');
    await expect(grill).not.toContainText('Cafea bar');
    const batchId = ticket.batches.find(
      (batch: { station: { code: string } }) => batch.station.code === 'BAR',
    ).id;
    const path = `/api/tenant/kitchen/tickets/${ticket.id}/batches/${batchId}`;
    let originalBody = '';
    await page.route(`**${path}`, async (route) => {
      originalBody = route.request().postData()!;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await bar.getByRole('button', { name: 'Începe prepararea', exact: true }).click();
    await expect(page.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await expect(
      grill.getByRole('button', { name: /Începe prepararea|Marchează gata|Parțial gata/ }),
    ).toHaveCount(0);
    await expect(grill.getByRole('button', { name: /^Vezi rețeta/ })).toBeEnabled();
    await page.unroute(`**${path}`);
    const retry = page.waitForResponse(
      (response) => response.url().endsWith(path) && response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Reîncearcă cererea', exact: true }).click();
    const replay = await retry;
    expect(replay.status()).toBe(409);
    expect(replay.request().postData()).toBe(originalBody);
    await page.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await bar.getByRole('button', { name: 'Marchează gata', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'Parțial gata', exact: true })
        .getByRole('heading', { name: 'Comanda #1', exact: true }),
    ).toBeVisible();
    expect((await (await api(page, `/orders/${order.id}`)).json()).order.status).toBe(
      'IN_PROGRESS',
    );
    for (const size of [
      { width: 360, height: 800 },
      { width: 768, height: 1024 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(size);
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`batches-${size.width}.png`), fullPage: true });
    }
    const stationFilter = page.getByRole('combobox', { name: 'Stația afișată', exact: true });
    await stationFilter.selectOption({ label: 'BAR · Bar sintetic' });
    await expect(
      page
        .getByRole('region', { name: 'Gata în bucătărie', exact: true })
        .getByRole('heading', { name: 'Comanda #1', exact: true }),
    ).toBeVisible();
    await expect(grill).toHaveCount(0);
    await expect(page.getByText('Starea comenzii: Parțial gata', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 360, height: 800 });
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('station-filter-360.png'), fullPage: true });
    await stationFilter.selectOption({ label: 'GRILL · Grătar sintetic' });
    await expect(bar).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: 'De pregătit', exact: true })
        .getByRole('heading', { name: 'Comanda #1', exact: true }),
    ).toBeVisible();
    await grill.getByRole('button', { name: 'Începe prepararea', exact: true }).click();
    await grill.getByRole('button', { name: 'Marchează gata', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'Gata în bucătărie', exact: true })
        .getByRole('heading', { name: 'Comanda #1', exact: true }),
    ).toBeVisible();
    expect((await (await api(page, `/orders/${order.id}`)).json()).order).toMatchObject({
      status: 'IN_PROGRESS',
      kitchenStatus: 'READY',
      packingStatus: 'WAITING',
    });
  } finally {
    await f.dispose();
  }
});
