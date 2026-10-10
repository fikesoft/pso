import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { orderRealtimeFixture } from './order-realtime-setup';
import { api, noOverflow, submit } from './support/browser-helpers';

test('comenzi live: două contexte păstrează filtrele și două pagini, apoi recuperează modificările pierdute la reconectare', async ({
  browser,
}) => {
  const f = await orderRealtimeFixture(browser);
  const { admin, operator, location, product } = f;
  try {
    const create = async () => {
      const response = await api(admin, '/orders', {
        locationId: location.id,
        serviceType: 'PICKUP',
        requestKey: randomUUID(),
        customer: { name: 'Grup realtime', phone: '060700800' },
        items: [{ productId: product.id, quantity: '1' }],
      });
      expect(response.status()).toBe(200);
      return (await response.json()).order;
    };
    const first = await create();
    for (let index = 0; index < 50; index++) await create();
    await operator.locator('summary').filter({ hasText: 'Caută comenzi' }).click();
    const search = operator.getByRole('form', { name: 'Caută comenzi', exact: true });
    await search.getByLabel('Numele clientului', { exact: true }).fill('grup realtime');
    await submit(
      operator,
      '/api/tenant/orders/search',
      search.getByRole('button', { name: 'Aplică filtrele', exact: true }),
    );
    await expect(
      operator.getByRole('button', { name: 'Deschide comanda', exact: true }),
    ).toHaveCount(50);
    await submit(
      operator,
      '/api/tenant/orders/search',
      operator.getByRole('button', { name: 'Încarcă mai multe', exact: true }),
    );
    await expect(
      operator.getByRole('button', { name: 'Deschide comanda', exact: true }),
    ).toHaveCount(51);
    await create();
    await expect(
      operator.getByRole('button', { name: 'Deschide comanda', exact: true }),
    ).toHaveCount(52);
    await expect(operator.getByRole('heading', { name: 'Comanda #1', exact: true })).toBeVisible();
    expect(
      (
        await api(
          admin,
          `/orders/${first.id}`,
          {
            version: 1,
            serviceType: 'PICKUP',
            customer: { name: 'Alt grup' },
            items: [{ id: first.items[0].id, productId: product.id, quantity: '1' }],
          },
          'PATCH',
        )
      ).status(),
    ).toBe(200);
    await expect(
      operator.getByRole('button', { name: 'Deschide comanda', exact: true }),
    ).toHaveCount(51);
    await expect(operator.getByRole('heading', { name: 'Comanda #1', exact: true })).toHaveCount(0);
    await operator.evaluate(() => window.dispatchEvent(new Event('test:pause-orders')));
    await expect(
      operator.getByText('Comenzi actualizate în timp real', { exact: true }),
    ).toHaveCount(0);
    const missed = await create();
    await expect(
      operator.getByRole('heading', { name: `Comanda #${missed.number}`, exact: true }),
    ).toHaveCount(0);
    const resync = operator.waitForResponse(
      (r) => r.url().endsWith('/api/tenant/orders/search') && r.request().method() === 'POST',
    );
    await operator.evaluate(() => window.dispatchEvent(new Event('test:resume-orders')));
    expect((await resync).status()).toBe(200);
    await expect(
      operator.getByText('Comenzi actualizate în timp real', { exact: true }),
    ).toBeVisible();
    await expect(
      operator.getByRole('button', { name: 'Deschide comanda', exact: true }),
    ).toHaveCount(52);
    await expect(search.getByLabel('Numele clientului', { exact: true })).toHaveValue(
      'grup realtime',
    );
    const headings = await operator.getByRole('heading', { name: /^Comanda #/ }).allTextContents();
    expect(new Set(headings).size).toBe(52);
  } finally {
    await f.dispose();
  }
});

test('comenzi live: detaliul selectat și cronologia se actualizează fără a rescrie ciorna modificată local', async ({
  browser,
}, info) => {
  const f = await orderRealtimeFixture(browser);
  const { admin, operator, location, product } = f;
  try {
    const created = await api(admin, '/orders', {
      locationId: location.id,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      customer: { name: 'Client live selectat', phone: '060700800' },
      items: [{ productId: product.id, quantity: '1' }],
    });
    expect(created.status()).toBe(200);
    let order = (await created.json()).order;
    await operator.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    const detail = operator.getByRole('dialog', { name: 'Comanda #1', exact: true });
    await detail.getByTestId('order-timeline').locator('summary').click();
    const timeline = detail.getByRole('region', { name: 'Cronologia comenzii', exact: true });
    await expect(timeline.getByTestId('order-timeline-event')).toHaveCount(1);
    const changed = await api(
      admin,
      `/orders/${order.id}`,
      {
        version: 1,
        serviceType: 'PICKUP',
        items: [{ id: order.items[0].id, productId: product.id, quantity: '2' }],
      },
      'PATCH',
    );
    expect(changed.status()).toBe(200);
    order = (await changed.json()).order;
    await expect(timeline.getByTestId('order-timeline-event')).toHaveCount(2);
    await expect(timeline.getByTestId('order-timeline-event').first()).toContainText(
      'Versiunea comenzii: 2',
    );
    await expect(detail).toContainText('20.01 MDL');
    expect(
      (
        await api(admin, '/orders', {
          locationId: location.id,
          serviceType: 'PICKUP',
          requestKey: randomUUID(),
          items: [{ productId: product.id, quantity: '1' }],
        })
      ).status(),
    ).toBe(200);
    await expect(detail).toBeVisible();
    await expect(operator.getByRole('dialog', { name: 'Comanda #2', exact: true })).toHaveCount(0);
    await detail.getByRole('button', { name: 'Editează ciorna', exact: true }).click();
    const editor = operator.getByRole('dialog', { name: 'Editează ciorna #1', exact: true });
    await editor.getByLabel('Cantitate', { exact: true }).fill('4');
    const passiveRefresh = operator.waitForResponse(
      (r) => r.url().endsWith('/api/tenant/orders/search') && r.request().method() === 'POST',
    );
    expect(
      (
        await api(
          admin,
          `/orders/${order.id}`,
          {
            version: order.version,
            serviceType: 'PICKUP',
            items: [{ id: order.items[0].id, productId: product.id, quantity: '3' }],
          },
          'PATCH',
        )
      ).status(),
    ).toBe(200);
    expect((await passiveRefresh).status()).toBe(200);
    await expect(editor.getByLabel('Cantitate', { exact: true })).toHaveValue('4');
    const response = operator.waitForResponse(
      (r) => r.url().endsWith(`/api/tenant/orders/${order.id}`) && r.request().method() === 'PATCH',
    );
    await editor.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    expect((await response).status()).toBe(409);
    await expect(editor.getByLabel('Cantitate', { exact: true })).toHaveValue('4');
    await editor.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await expect(editor.getByLabel('Cantitate', { exact: true })).toHaveValue('3.000');
    await operator.setViewportSize({ width: 360, height: 800 });
    await noOverflow(operator);
    await operator.screenshot({
      path: info.outputPath('order-realtime-editor-360.png'),
      fullPage: true,
    });
  } finally {
    await f.dispose();
  }
});
