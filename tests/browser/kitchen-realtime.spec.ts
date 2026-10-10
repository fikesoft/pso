import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { orderRealtimeFixture } from './order-realtime-setup';
import { api } from './support/browser-helpers';

test('bucătărie live: două sesiuni, paginare, filtru și recuperare după reconectare', async ({
  browser,
}) => {
  const f = await orderRealtimeFixture(browser, 'kitchen');
  const { admin, operator, location, product } = f;
  try {
    const filter = operator.getByRole('combobox', { name: 'Stația afișată', exact: true });
    await filter.selectOption('UNASSIGNED');
    const create = async () => {
      const draft = await api(admin, '/orders', {
        locationId: location.id,
        serviceType: 'PICKUP',
        requestKey: randomUUID(),
        items: [{ productId: product.id, quantity: '1' }],
      });
      expect(draft.status()).toBe(200);
      const { order } = await draft.json();
      const sent = await api(admin, `/orders/${order.id}/send`, {
        version: order.version,
        requestKey: randomUUID(),
      });
      expect(sent.status()).toBe(200);
      return (await sent.json()).ticket;
    };
    const first = await create();
    const queued = operator.getByRole('region', { name: 'De pregătit', exact: true });
    await expect(queued.getByRole('heading', { name: 'Comanda #1', exact: true })).toBeVisible();
    for (let i = 0; i < 50; i++) await create();
    await expect(queued.getByRole('heading', { name: /^Comanda #/ })).toHaveCount(50);
    await queued.getByRole('button', { name: 'Încarcă mai multe', exact: true }).click();
    await expect(queued.getByRole('heading', { name: /^Comanda #/ })).toHaveCount(51);
    await create();
    await expect(queued.getByRole('heading', { name: /^Comanda #/ })).toHaveCount(52);
    expect(
      (
        await api(
          admin,
          `/kitchen/tickets/${first.id}`,
          { version: 1, status: 'PREPARING' },
          'PATCH',
        )
      ).status(),
    ).toBe(200);
    await expect(queued.getByRole('heading', { name: 'Comanda #1', exact: true })).toHaveCount(0);
    await expect(
      operator
        .getByRole('region', { name: 'În preparare', exact: true })
        .getByRole('heading', { name: 'Comanda #1', exact: true }),
    ).toBeVisible();
    await operator.evaluate(() => window.dispatchEvent(new Event('test:pause-kitchen')));
    await expect(
      operator.getByText('Bucătărie actualizată în timp real', { exact: true }),
    ).toHaveCount(0);
    await create();
    await expect(queued.getByRole('heading', { name: 'Comanda #53', exact: true })).toHaveCount(0);
    await operator.evaluate(() => window.dispatchEvent(new Event('test:resume-kitchen')));
    await expect(queued.getByRole('heading', { name: 'Comanda #53', exact: true })).toBeVisible();
    await expect(queued.getByRole('heading', { name: /^Comanda #/ })).toHaveCount(52);
    await expect(filter).toHaveValue('UNASSIGNED');
    const cancelled = await api(admin, `/orders/${first.orderId}/cancel`, {
      version: (await (await api(admin, `/orders/${first.orderId}`)).json()).order.version,
      requestKey: randomUUID(),
      reason: 'Anulare sintetică live',
    });
    expect(cancelled.status()).toBe(200);
    await expect(operator.getByRole('heading', { name: 'Comanda #1', exact: true })).toHaveCount(0);
    expect((await api(operator, '/auth/logout', {})).status()).toBe(200);
    await expect(operator.getByRole('heading', { name: /^Comanda #/ })).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});
