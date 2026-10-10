import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { KitchenTicket } from '../../packages/contracts/src';
import { orderRealtimeFixture } from './order-realtime-setup';
import { api, navigateSection, submit } from './support/browser-helpers';

test('etape recuperare: răspuns pierdut, reload, retragere și conflict de versiune', async ({
  browser,
}) => {
  const f = await orderRealtimeFixture(browser, 'kitchen');
  const page = f.admin;
  try {
    const created = await api(page, '/orders', {
      locationId: f.location.id,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      items: [1, 2, 3].map((courseNumber) => ({
        productId: f.product.id,
        quantity: '1',
        courseNumber,
      })),
    });
    expect(created.status()).toBe(200);
    const { order } = await created.json();
    const sent = await api(page, `/orders/${order.id}/send`, {
      version: order.version,
      requestKey: randomUUID(),
    });
    expect(sent.status()).toBe(200);
    const { ticket }: { ticket: KitchenTicket } = await sent.json();
    const open = async () => {
      await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
      await navigateSection(page, 'Bucătărie');
    };
    await open();
    const path = `/api/tenant/kitchen/tickets/${ticket.id}/fire`;
    const first = page.getByRole('button', { name: 'Lansează: Etapa 1 · Aperitive', exact: true });
    const second = page.getByRole('button', {
      name: 'Lansează: Etapa 2 · Fel principal',
      exact: true,
    });
    const third = page.getByRole('button', { name: 'Lansează: Etapa 3 · Desert', exact: true });
    const resolve = page.getByRole('button', {
      name: 'Verifică rezultatul operației',
      exact: true,
    });
    await page.route(`**${path}`, async (route) => {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await first.click();
    await expect(resolve).toBeEnabled();
    await expect(second).toBeDisabled();
    await page.unroute(`**${path}`);
    await page.reload();
    await open();
    await expect(resolve).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }),
    ).toHaveCount(0);
    await resolve.click();
    await expect(second).toBeEnabled();
    await expect(first).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        Object.keys(sessionStorage).filter((key) => key.startsWith('pos.kitchen-course:')),
      ),
    ).toEqual([]);
    await page.route(`**${path}`, (route) => route.abort('failed'));
    await second.click();
    await expect(resolve).toBeEnabled();
    await page.unroute(`**${path}`);
    await resolve.click();
    await expect(
      page.getByText('Tentativa a fost retrasă definitiv. Poți începe explicit o operație nouă.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(second).toBeEnabled();
    await submit(page, path, second);
    const starter = ticket.batches.find((batch) => batch.courseNumber === 1)!;
    await page.route(
      `**${path}`,
      async (route) => {
        const changed = await api(
          page,
          `/kitchen/tickets/${ticket.id}/batches/${starter.id}`,
          { version: 2, status: 'PREPARING' },
          'PATCH',
        );
        expect(changed.status()).toBe(200);
        await route.continue();
      },
      { times: 1 },
    );
    const conflict = page.waitForResponse((response) => new URL(response.url()).pathname === path);
    await third.click();
    expect((await conflict).status()).toBe(409);
    await expect(third).toBeDisabled();
    await page.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await expect(third).toBeEnabled();
    await submit(page, path, third);
    await expect(third).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});
