import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { KitchenTicket } from '../../packages/contracts/src';
import { orderRealtimeFixture } from './order-realtime-setup';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('etape KDS: ciornă, toate stațiile, așteptare, timer și gata după ultima etapă', async ({
  browser,
}, info) => {
  const f = await orderRealtimeFixture(browser, 'kitchen');
  const page = f.admin;
  try {
    const stationResponse = await api(page, '/kitchen-stations', {
      locationId: f.location.id,
      requestKey: randomUUID(),
      code: 'BAR',
      name: 'Bar etape',
      sortOrder: 0,
    });
    expect(stationResponse.status()).toBe(200);
    const { station } = await stationResponse.json();
    expect(
      (
        await api(
          page,
          '/kitchen-routing',
          {
            locationId: f.location.id,
            productId: f.product.id,
            stationId: station.id,
            version: 0,
            requestKey: randomUUID(),
          },
          'PUT',
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await api(page, '/catalog/products', {
          locationId: f.location.id,
          name: 'Ceai etape',
          sku: 'TEA-COURSES',
          price: '5',
        })
      ).status(),
    ).toBe(200);
    await navigateSection(page, 'Comenzi');
    await page.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = page.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await draft.getByLabel('Masa', { exact: true }).fill('7');
    for (let i = 0; i < 3; i++)
      await draft.getByRole('button', { name: /Cafea sintetică/ }).click();
    await draft.getByRole('button', { name: /Ceai etape/ }).click();
    const selectors = draft.getByLabel('Etapa mesei', { exact: true });
    await expect(selectors).toHaveCount(4);
    for (const [index, value] of ['1', '2', '3', '1'].entries())
      await selectors.nth(index).selectOption(value);
    await page.setViewportSize({ width: 360, height: 800 });
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('course-draft-360.png'), fullPage: true });
    const { order } = await submit(
      page,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(order.items.map((item: { courseNumber: number }) => item.courseNumber)).toEqual([
      1, 2, 3, 1,
    ]);
    await page.keyboard.press('Escape');
    const sent = await api(page, `/orders/${order.id}/send`, {
      version: order.version,
      requestKey: randomUUID(),
    });
    expect(sent.status()).toBe(200);
    const { ticket }: { ticket: KitchenTicket } = await sent.json();
    await navigateSection(page, 'Bucătărie');
    const card = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Comanda #1', exact: true }) });
    await expect(card.getByText('Așteaptă lansarea în bucătărie', { exact: true })).toHaveCount(4);
    await expect(card.getByRole('timer')).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Începe prepararea', exact: true })).toHaveCount(
      0,
    );
    await expect(f.operator.getByRole('button', { name: /^Lansează/ })).toHaveCount(0);
    await page.getByLabel('Stația afișată', { exact: true }).selectOption(station.id);
    await expect(card.getByText('Așteaptă lansarea în bucătărie', { exact: true })).toHaveCount(3);
    await submit(
      page,
      `/api/tenant/kitchen/tickets/${ticket.id}/fire`,
      card.getByRole('button', { name: 'Lansează: Etapa 1 · Aperitive', exact: true }),
    );
    const board = await (await api(page, `/kitchen/tickets?locationId=${f.location.id}`)).json();
    const current = board.tickets.find(
      (row: KitchenTicket) => row.id === ticket.id,
    ) as KitchenTicket;
    expect(
      current.batches.filter((batch) => batch.courseNumber === 1 && batch.firedAt !== null),
    ).toHaveLength(2);
    const starter = card.getByRole('region', {
      name: 'BAR · Bar etape · Etapa 1 · Aperitive',
      exact: true,
    });
    await expect(
      starter.getByRole('timer', { name: 'Timp de la lansare', exact: true }).locator('time'),
    ).toBeVisible();
    await starter.getByRole('button', { name: 'Începe prepararea', exact: true }).click();
    await starter.getByRole('button', { name: 'Marchează gata', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'Parțial gata', exact: true })
        .getByRole('heading', { name: 'Comanda #1', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comanda #1', exact: true })).toHaveCount(1);
    for (const width of [360, 1920]) {
      await page.setViewportSize({ width, height: width === 360 ? 800 : 1080 });
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`courses-${width}.png`), fullPage: true });
    }
    await submit(
      page,
      `/api/tenant/kitchen/tickets/${ticket.id}/fire`,
      card.getByRole('button', { name: 'Lansează toate etapele', exact: true }),
    );
    await page.getByLabel('Stația afișată', { exact: true }).selectOption('');
    for (let i = 0; i < 3; i++) {
      await card.getByRole('button', { name: 'Începe prepararea', exact: true }).first().click();
      await card.getByRole('button', { name: 'Marchează gata', exact: true }).click();
    }
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
