import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { orderRealtimeFixture } from './order-realtime-setup';
import { api } from './support/browser-helpers';

async function holdFirstCursor(page: Page, pattern: string, hasCursor: (r: Request) => boolean) {
  let release!: () => void;
  let captured!: () => void;
  let finished!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    captured = resolve;
  });
  const done = new Promise<void>((resolve) => {
    finished = resolve;
  });
  let held = false;
  await page.route(pattern, async (route) => {
    if (held || !hasCursor(route.request())) return route.continue();
    held = true;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    captured();
    await gate;
    await route.fulfill({ response });
    finished();
  });
  return { pending, done, release };
}

test('comenzi live: cronologia păstrează pagina solicitată când un eveniment depășește răspunsul întârziat', async ({
  browser,
}) => {
  const f = await orderRealtimeFixture(browser);
  const { admin, operator, location, product } = f;
  let release: (() => void) | undefined;
  try {
    const created = await api(admin, '/orders', {
      locationId: location.id,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: '1' }],
    });
    expect(created.status()).toBe(200);
    let order = (await created.json()).order;
    const edit = async () => {
      const response = await api(
        admin,
        `/orders/${order.id}`,
        {
          version: order.version,
          serviceType: 'PICKUP',
          items: [{ id: order.items[0].id, productId: product.id, quantity: '1' }],
        },
        'PATCH',
      );
      expect(response.status()).toBe(200);
      order = (await response.json()).order;
    };
    for (let index = 0; index < 51; index++) await edit();
    await operator.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    const details = operator.getByRole('dialog', { name: 'Comanda #1', exact: true });
    await details.getByTestId('order-timeline').locator('summary').click();
    const timeline = details.getByRole('region', { name: 'Cronologia comenzii', exact: true });
    const events = timeline.getByTestId('order-timeline-event');
    await expect(events).toHaveCount(50);
    const held = await holdFirstCursor(
      operator,
      `**/api/tenant/orders/${order.id}/timeline?*`,
      (request) => new URL(request.url()).searchParams.has('cursor'),
    );
    release = held.release;
    await timeline.getByRole('button', { name: 'Mai multe evenimente', exact: true }).click();
    await held.pending;
    await edit();
    // Live revalidation must honor the second page already requested by the user.
    await expect(events).toHaveCount(53);
    held.release();
    await held.done;
    await expect(events).toHaveCount(53);
    await expect(events.first()).toContainText('Versiunea comenzii: 53');
    await expect(events.last()).toContainText('Comandă creată');
    const versions = await events
      .locator('p')
      .filter({ hasText: 'Versiunea comenzii:' })
      .allTextContents();
    expect(new Set(versions).size).toBe(53);
    await expect(
      timeline.getByRole('button', { name: 'Mai multe evenimente', exact: true }),
    ).toHaveCount(0);
  } finally {
    release?.();
    await f.dispose();
  }
});

test('comenzi live: lista păstrează pagina solicitată când o comandă nouă depășește răspunsul întârziat', async ({
  browser,
}) => {
  const f = await orderRealtimeFixture(browser);
  const { admin, operator, location, product } = f;
  let release: (() => void) | undefined;
  try {
    const create = async () => {
      const response = await api(admin, '/orders', {
        locationId: location.id,
        serviceType: 'PICKUP',
        requestKey: randomUUID(),
        items: [{ productId: product.id, quantity: '1' }],
      });
      expect(response.status()).toBe(200);
    };
    for (let index = 0; index < 51; index++) await create();
    const buttons = operator.getByRole('button', { name: 'Deschide comanda', exact: true });
    await expect(buttons).toHaveCount(50);
    const held = await holdFirstCursor(
      operator,
      '**/api/tenant/orders/search',
      (request) => request.method() === 'POST' && !!request.postDataJSON()?.cursor,
    );
    release = held.release;
    await operator.getByRole('button', { name: 'Încarcă mai multe', exact: true }).click();
    await held.pending;
    await create();
    await expect(buttons).toHaveCount(52);
    held.release();
    await held.done;
    await expect(buttons).toHaveCount(52);
    await expect(operator.getByRole('heading', { name: 'Comanda #1', exact: true })).toBeVisible();
    await expect(operator.getByRole('heading', { name: 'Comanda #52', exact: true })).toBeVisible();
    const headings = await operator.getByRole('heading', { name: /^Comanda #/ }).allTextContents();
    expect(new Set(headings).size).toBe(52);
    await expect(
      operator.getByRole('button', { name: 'Încarcă mai multe', exact: true }),
    ).toHaveCount(0);
  } finally {
    release?.();
    await f.dispose();
  }
});
