import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { orderRealtimeFixture } from './order-realtime-setup';
import { api, navigateSection, noOverflow } from './support/browser-helpers';

async function seconds(timer: Locator) {
  const duration = await timer.locator('time').getAttribute('datetime');
  expect(duration).toMatch(/^PT\d+S$/);
  return Number(duration!.slice(2, -1));
}

test('timere KDS: ora serverului, progres fără resetare, reload și durată finală înghețată', async ({
  browser,
}, info) => {
  const f = await orderRealtimeFixture(browser, 'kitchen');
  const { admin, operator, location, product } = f;
  try {
    await operator.clock.setSystemTime(new Date('2040-01-01T12:00:00Z'));
    const create = async () => {
      const response = await api(admin, '/orders', {
        locationId: location.id,
        serviceType: 'PICKUP',
        requestKey: randomUUID(),
        items: [{ productId: product.id, quantity: '1' }],
      });
      expect(response.status()).toBe(200);
      const { order } = await response.json();
      const sent = await api(admin, `/orders/${order.id}/send`, {
        version: order.version,
        requestKey: randomUUID(),
      });
      expect(sent.status()).toBe(200);
      return (await sent.json()).ticket;
    };
    const ticket = await create();
    await create();
    const first = operator
      .locator('article')
      .filter({ has: operator.getByRole('heading', { name: 'Comanda #1', exact: true }) });
    const second = operator
      .locator('article')
      .filter({ has: operator.getByRole('heading', { name: 'Comanda #2', exact: true }) });
    const running = first.getByRole('timer', { name: 'Timp de la trimitere', exact: true });
    await expect(running.locator('time')).toBeVisible();
    expect(await seconds(running)).toBeLessThan(30);
    const initial = await seconds(running);
    await expect.poll(() => seconds(running)).toBeGreaterThanOrEqual(initial + 2);
    expect(
      (
        await api(
          admin,
          `/kitchen/tickets/${ticket.id}`,
          { version: 1, status: 'PREPARING' },
          'PATCH',
        )
      ).status(),
    ).toBe(200);
    await expect(
      operator
        .getByRole('region', { name: 'În preparare', exact: true })
        .getByRole('heading', { name: 'Comanda #1', exact: true }),
    ).toBeVisible();
    expect(await seconds(running)).toBeGreaterThanOrEqual(initial + 2);
    await operator.clock.setSystemTime(new Date('2000-01-01T12:00:00Z'));
    const beforeReload = await seconds(running);
    await operator.reload();
    await operator
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(location.id);
    await navigateSection(operator, 'Bucătărie');
    await expect(running.locator('time')).toBeVisible();
    expect(await seconds(running)).toBeGreaterThanOrEqual(beforeReload - 1);
    const readyResponse = await api(
      admin,
      `/kitchen/tickets/${ticket.id}`,
      { version: 2, status: 'READY' },
      'PATCH',
    );
    expect(readyResponse.status()).toBe(200);
    const ready = (await readyResponse.json()).ticket;
    const frozen = first.getByRole('timer', { name: 'Durata pregătirii', exact: true });
    await expect(frozen.locator('time')).toBeVisible();
    const expected = Math.floor((Date.parse(ready.updatedAt) - Date.parse(ready.createdAt)) / 1000);
    expect(await seconds(frozen)).toBe(expected);
    const secondTimer = second.getByRole('timer', { name: 'Timp de la trimitere', exact: true });
    const continuing = await seconds(secondTimer);
    await expect.poll(() => seconds(secondTimer)).toBeGreaterThanOrEqual(continuing + 2);
    expect(await seconds(frozen)).toBe(expected);
    for (const width of [360, 1920]) {
      await operator.setViewportSize({ width, height: width === 360 ? 800 : 1080 });
      await noOverflow(operator);
      await operator.screenshot({
        path: info.outputPath(`kitchen-timers-${width}.png`),
        fullPage: true,
      });
    }
  } finally {
    await f.dispose();
  }
});
