import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { KitchenTicket } from '../../packages/contracts/src';
import { orderRealtimeFixture } from './order-realtime-setup';
import { api } from './support/browser-helpers';
test('alerte stații: filtrul izolează severitatea și grupul gata nu păstrează alerta', async ({
  browser,
}) => {
  const f = await orderRealtimeFixture(browser, 'kitchen');
  try {
    const secondResponse = await api(f.admin, '/catalog/products', {
      locationId: f.location.id,
      name: 'Ceai sintetic',
      sku: 'TEA-ALERT',
      price: '5.00',
    });
    expect(secondResponse.status()).toBe(200);
    const { product: second } = await secondResponse.json();
    const stationIds: string[] = [];
    for (const [index, productId] of [f.product.id, second.id].entries()) {
      const response = await api(f.admin, '/kitchen-stations', {
        locationId: f.location.id,
        requestKey: randomUUID(),
        code: `S${index}`,
        name: `Stație ${index}`,
        sortOrder: index,
      });
      expect(response.status()).toBe(200);
      const { station } = await response.json();
      stationIds.push(station.id);
      expect(
        (
          await api(
            f.admin,
            '/kitchen-routing',
            {
              locationId: f.location.id,
              productId,
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
          await api(
            f.admin,
            '/kitchen-alerts',
            {
              scope: { scopeType: 'LOCATION', locationId: f.location.id },
              target: { kind: 'STATION', stationId: station.id },
              version: 0,
              requestKey: randomUUID(),
              thresholds:
                index === 0
                  ? { warningSeconds: 1, criticalSeconds: 2 }
                  : { warningSeconds: 600, criticalSeconds: 900 },
            },
            'PUT',
          )
        ).status(),
      ).toBe(200);
    }
    const draft = await api(f.admin, '/orders', {
      locationId: f.location.id,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      items: [f.product.id, second.id].map((productId) => ({ productId, quantity: '1' })),
    });
    expect(draft.status()).toBe(200);
    const { order } = await draft.json();
    const sent = await api(f.admin, `/orders/${order.id}/send`, {
      version: order.version,
      requestKey: randomUUID(),
    });
    expect(sent.status()).toBe(200);
    const { ticket }: { ticket: KitchenTicket } = await sent.json();
    const card = f.operator
      .locator('article')
      .filter({ has: f.operator.getByRole('heading', { name: 'Comanda #1', exact: true }) });
    await expect(card).toHaveAttribute('data-kitchen-alert', 'CRITICAL');
    const filter = f.operator.getByLabel('Stația afișată', { exact: true });
    await filter.selectOption(stationIds[1]!);
    await expect(card).toHaveAttribute('data-kitchen-alert', 'NORMAL');
    await expect(card.getByText('Cafea sintetică', { exact: false })).toHaveCount(0);
    await filter.selectOption(stationIds[0]!);
    await expect(card).toHaveAttribute('data-kitchen-alert', 'CRITICAL');
    const batch = ticket.batches.find((row) => row.station?.id === stationIds[0])!;
    for (const [index, status] of ['PREPARING', 'READY'].entries())
      expect(
        (
          await api(
            f.admin,
            `/kitchen/tickets/${ticket.id}/batches/${batch.id}`,
            { version: index + 1, status },
            'PATCH',
          )
        ).status(),
      ).toBe(200);
    await expect(card.getByRole('timer', { name: 'Durata pregătirii', exact: true })).toBeVisible();
    await expect(card).not.toHaveAttribute('data-kitchen-alert', /.+/);
    await filter.selectOption('');
    await expect(card).toHaveAttribute('data-kitchen-alert', 'NORMAL');
  } finally {
    await f.dispose();
  }
});
