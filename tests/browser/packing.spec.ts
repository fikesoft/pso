import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('ambalare: așteptare, checklist, răspuns pierdut, reload și finalizare pe mobil', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser);
  const page = f.admin;
  try {
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    const product = await createOperationalProduct(page);
    const created = await api(page, '/orders', {
      locationId: f.location.id,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      items: [
        { productId: product.id, quantity: '1.250', note: 'Separat, fără zahăr' },
        { productId: product.id, quantity: '2.500' },
      ],
    });
    expect(created.status()).toBe(200);
    const { order } = await created.json();
    const sent = await api(page, `/orders/${order.id}/send`, {
      version: order.version,
      requestKey: randomUUID(),
    });
    expect(sent.status()).toBe(200);
    const { ticket } = await sent.json();
    await navigateSection(page, 'Ambalare');
    const card = page.getByRole('article', { name: `Comanda #${order.number}`, exact: true });
    const start = card.getByRole('button', { name: 'Începe verificarea', exact: true });
    await expect(start).toBeDisabled();
    await expect(card.getByRole('checkbox')).toHaveCount(2);
    await expect(card.getByText('1.250 × Cafea sintetică', { exact: true })).toBeVisible();
    await expect(card.getByText('Separat, fără zahăr', { exact: true })).toBeVisible();
    for (const [index, status] of ['PREPARING', 'READY'].entries())
      expect(
        (
          await api(page, `/kitchen/tickets/${ticket.id}`, { version: index + 1, status }, 'PATCH')
        ).status(),
      ).toBe(200);
    await expect(start).toBeEnabled({ timeout: 15_000 });
    expect((await (await api(page, `/orders/${order.id}`)).json()).order).toMatchObject({
      status: 'IN_PROGRESS',
      kitchenStatus: 'READY',
      packingStatus: 'WAITING',
    });
    const listed = await (await api(page, `/packing/sessions?locationId=${f.location.id}`)).json();
    const session = listed.sessions.find((row: { orderId: string }) => row.orderId === order.id);
    const path = `/api/tenant/packing/sessions/${session.id}/commands`;
    await submit(page, path, start);
    const complete = card.getByRole('button', { name: 'Confirmă ambalarea', exact: true });
    await expect(complete).toBeDisabled();
    await page.route(`**${path}`, async (route) => {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await card.getByRole('checkbox').nth(0).click();
    const resolve = page.getByRole('button', {
      name: 'Verifică rezultatul operației',
      exact: true,
    });
    await expect(resolve).toBeEnabled();
    await expect(card.getByRole('checkbox').nth(1)).toBeDisabled();
    await page.unroute(`**${path}`);
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Ambalare');
    await expect(resolve).toBeEnabled();
    await resolve.click();
    await expect(card.getByRole('checkbox').nth(0)).toBeChecked();
    await expect(card.getByRole('checkbox').nth(1)).toBeEnabled();
    await card.getByRole('checkbox').nth(0).click();
    await expect(card.getByRole('checkbox').nth(0)).not.toBeChecked();
    await card.getByRole('checkbox').nth(0).click();
    await expect(card.getByRole('checkbox').nth(1)).toBeEnabled();
    await card.getByRole('checkbox').nth(1).click();
    await expect(complete).toBeEnabled();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`packing-${width}.png`), fullPage: true });
    }
    await submit(page, path, complete);
    expect((await (await api(page, `/orders/${order.id}`)).json()).order).toMatchObject({
      status: 'READY',
      kitchenStatus: 'READY',
      packingStatus: 'READY',
    });
    await expect(card).toHaveCount(0);
    await page.getByLabel('Starea ambalării', { exact: true }).selectOption('READY');
    await expect(card).toBeVisible();
    await expect(card.getByRole('checkbox').nth(0)).toBeChecked();
    await expect(card.getByRole('checkbox').nth(1)).toBeDisabled();
    expect(
      await page.evaluate(() =>
        Object.keys(sessionStorage).filter((key) => key.startsWith('pos.packing:')),
      ),
    ).toEqual([]);
  } finally {
    await f.dispose();
  }
});
