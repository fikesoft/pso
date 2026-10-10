import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { orderRealtimeFixture } from './order-realtime-setup';
import { api, noOverflow } from './support/browser-helpers';

test('alerte KDS: praguri temporale, configurare live, revenire la moștenire și oprire la gata', async ({
  browser,
}, info) => {
  const f = await orderRealtimeFixture(browser, 'kitchen');
  const { admin, operator, location, product } = f;
  try {
    const configure = async (
      version: number,
      thresholds: { warningSeconds: number; criticalSeconds: number } | null,
    ) => {
      const response = await api(
        admin,
        '/kitchen-alerts',
        {
          scope: { scopeType: 'LOCATION', locationId: location.id },
          target: { kind: 'DEFAULT' },
          version,
          thresholds,
          requestKey: randomUUID(),
        },
        'PUT',
      );
      expect(response.status()).toBe(200);
    };
    await configure(0, { warningSeconds: 5, criticalSeconds: 10 });
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
    const { ticket } = await sent.json();
    const card = operator
      .locator('article')
      .filter({ has: operator.getByRole('heading', { name: 'Comanda #1', exact: true }) });
    await expect(card).toHaveAttribute('data-kitchen-alert', 'NORMAL');
    await expect(card).toHaveAttribute('data-kitchen-alert', 'WARNING', { timeout: 12000 });
    await expect(card).toHaveAttribute('data-kitchen-alert', 'CRITICAL', { timeout: 12000 });
    for (const width of [360, 1920]) {
      await operator.setViewportSize({ width, height: width === 360 ? 800 : 1080 });
      await noOverflow(operator);
      await operator.screenshot({
        path: info.outputPath(`kitchen-alerts-${width}.png`),
        fullPage: true,
      });
    }
    await configure(1, null);
    await expect(card).toHaveAttribute('data-kitchen-alert', 'NORMAL');
    await configure(2, { warningSeconds: 1, criticalSeconds: 2 });
    await expect(card).toHaveAttribute('data-kitchen-alert', 'CRITICAL');
    const prepared = await api(
      admin,
      `/kitchen/tickets/${ticket.id}`,
      { version: 1, status: 'PREPARING' },
      'PATCH',
    );
    expect(prepared.status()).toBe(200);
    const ready = await api(
      admin,
      `/kitchen/tickets/${ticket.id}`,
      { version: 2, status: 'READY' },
      'PATCH',
    );
    expect(ready.status()).toBe(200);
    await expect(card.getByRole('timer', { name: 'Durata pregătirii', exact: true })).toBeVisible();
    await expect(card).not.toHaveAttribute('data-kitchen-alert', /.+/);
    await expect(card.getByText('Întârziere critică', { exact: true })).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});
