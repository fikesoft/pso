import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow } from './support/browser-helpers';

for (const committed of [true, false]) {
  test(`conflict ciornă: răspuns pierdut ${committed ? 'după salvare' : 'înainte de salvare cu editare concurentă'}, retry identic și reîncărcare explicită`, async ({
    browser,
  }) => {
    const f = await operationsFixture(browser);
    const { admin, location } = f;
    try {
      await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
      const product = await createOperationalProduct(admin);
      const response = await api(admin, '/orders', {
        locationId: location.id,
        serviceType: 'PICKUP',
        requestKey: randomUUID(),
        items: [{ productId: product.id, quantity: '1' }],
      });
      expect(response.status()).toBe(200);
      const order = (await response.json()).order;
      const path = `/api/tenant/orders/${order.id}`;
      await navigateSection(admin, 'Comenzi');
      await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
      await admin.getByRole('button', { name: 'Editează ciorna', exact: true }).click();
      const editor = admin.getByRole('dialog', { name: 'Editează ciorna #1', exact: true });
      const quantity = editor.getByLabel('Cantitate', { exact: true });
      await quantity.fill('2');
      let originalPayload = '';
      await admin.route(`**${path}`, async (route) => {
        if (route.request().method() !== 'PATCH') return route.continue();
        originalPayload = route.request().postData()!;
        if (committed) expect((await route.fetch()).status()).toBe(200);
        await route.abort('failed');
      });
      await editor.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
      await expect(editor.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
      await expect(quantity).toBeDisabled();
      await expect(editor.getByRole('button', { name: 'Reîncarcă', exact: true })).toHaveCount(0);
      await admin.keyboard.press('Escape');
      await expect(editor).toBeVisible();
      if (!committed) {
        const competing = await api(
          admin,
          `/orders/${order.id}`,
          {
            version: 1,
            serviceType: 'PICKUP',
            items: [{ id: order.items[0].id, productId: product.id, quantity: '3' }],
          },
          'PATCH',
        );
        expect(competing.status()).toBe(200);
      }
      await admin.unroute(`**${path}`);
      const retryRequest = admin.waitForRequest(
        (r) => r.url().endsWith(path) && r.method() === 'PATCH',
      );
      const retryResponse = admin.waitForResponse(
        (r) => r.url().endsWith(path) && r.request().method() === 'PATCH',
      );
      await editor.getByRole('button', { name: 'Reîncearcă cererea', exact: true }).click();
      expect((await retryRequest).postData()).toBe(originalPayload);
      expect((await retryResponse).status()).toBe(409);
      await expect(
        editor.getByText('Datele s-au schimbat. Reîncarcă această comandă înainte de continuare.', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(editor.getByText(/Răspunsul nu este confirmat/)).toHaveCount(0);
      await expect(quantity).toBeDisabled();
      await expect(
        editor.getByRole('button', { name: 'Salvează ciorna', exact: true }),
      ).toHaveCount(0);
      await editor.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
      await expect(quantity).toBeEnabled();
      await expect(quantity).toHaveValue(committed ? '2.000' : '3.000');
      await quantity.fill('4');
      const savedResponse = admin.waitForResponse(
        (r) => r.url().endsWith(path) && r.request().method() === 'PATCH',
      );
      await editor.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
      expect((await savedResponse).status()).toBe(200);
      await expect(editor).toHaveCount(0);
      const current = (await (await api(admin, `/orders/${order.id}`)).json()).order;
      expect(current).toMatchObject({ version: 3, items: [{ quantity: '4.000' }] });
      const timeline = await (await api(admin, `/orders/${order.id}/timeline`)).json();
      expect(
        timeline.events.filter((event: { action: string }) => event.action === 'DRAFT_UPDATED'),
      ).toHaveLength(2);
      await admin.setViewportSize({ width: 360, height: 800 });
      await noOverflow(admin);
    } finally {
      await f.dispose();
    }
  });
}

test('conflict bucătărie: retry după răspuns pierdut nu avansează tichetul și reîncărcarea restabilește starea', async ({
  browser,
}) => {
  const f = await operationsFixture(browser);
  const { admin, location } = f;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    const response = await api(admin, '/orders', {
      locationId: location.id,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: '1' }],
    });
    expect(response.status()).toBe(200);
    const order = (await response.json()).order;
    const sent = await api(admin, `/orders/${order.id}/send`, {
      version: 1,
      requestKey: randomUUID(),
    });
    expect(sent.status()).toBe(200);
    const ticket = (await sent.json()).ticket;
    const path = `/api/tenant/kitchen/tickets/${ticket.id}`;
    await navigateSection(admin, 'Bucătărie');
    let originalPayload = '';
    await admin.route(`**${path}`, async (route) => {
      originalPayload = route.request().postData()!;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await admin.getByRole('button', { name: 'Începe prepararea', exact: true }).click();
    await expect(admin.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Reîncarcă', exact: true })).toBeDisabled();
    await expect(admin.getByRole('button', { name: 'Marchează gata', exact: true })).toHaveCount(0);
    await admin.unroute(`**${path}`);
    const retryRequest = admin.waitForRequest(
      (r) => r.url().endsWith(path) && r.method() === 'PATCH',
    );
    const retryResponse = admin.waitForResponse(
      (r) => r.url().endsWith(path) && r.request().method() === 'PATCH',
    );
    await admin.getByRole('button', { name: 'Reîncearcă cererea', exact: true }).click();
    expect((await retryRequest).postData()).toBe(originalPayload);
    expect((await retryResponse).status()).toBe(409);
    await expect(
      admin.getByText('Datele s-au schimbat. Reîncarcă această comandă înainte de continuare.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(admin.getByText(/Răspunsul nu este confirmat/)).toHaveCount(0);
    await expect(
      admin.getByText('Starea preparării a fost actualizată.', { exact: true }),
    ).toHaveCount(0);
    await expect(admin.getByRole('button', { name: 'Începe prepararea', exact: true })).toHaveCount(
      0,
    );
    await expect(admin.getByRole('button', { name: 'Marchează gata', exact: true })).toHaveCount(0);
    await admin.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    const preparing = admin.getByRole('region', { name: 'În preparare', exact: true });
    await expect(preparing.getByRole('heading', { name: 'Comanda #1', exact: true })).toBeVisible();
    const before = (await (await api(admin, `/orders/${order.id}`)).json()).order;
    expect(before.kitchenStatus).toBe('PREPARING');
    const readyResponse = admin.waitForResponse(
      (r) => r.url().endsWith(path) && r.request().method() === 'PATCH',
    );
    await preparing.getByRole('button', { name: 'Marchează gata', exact: true }).click();
    expect((await readyResponse).status()).toBe(200);
    const after = (await (await api(admin, `/orders/${order.id}`)).json()).order;
    expect(after.kitchenStatus).toBe('READY');
    const history = await (await api(admin, `/orders/${order.id}/timeline`)).json();
    expect(
      history.events.filter(
        (event: { kind: string; toStatus: string }) =>
          event.kind === 'KITCHEN' && event.toStatus === 'PREPARING',
      ),
    ).toHaveLength(1);
  } finally {
    await f.dispose();
  }
});
