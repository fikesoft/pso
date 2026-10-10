import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct, changeOperationalPrice } from './support/operations-catalog';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';
import { verifyProductPagination } from './support/operations-pagination';
import {
  verifyUnknownRetryRefused,
  verifyOrderCatalogRecovery,
  verifyNewDraftRejected,
  verifyUnknownSend,
} from './support/recovery';

test('operațiuni C: catalog → ciornă idempotentă → preț istoric → bucătărie responsive', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await operationsFixture(browser);
  const { admin, location, otherLocation } = fixture;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    await verifyOrderCatalogRecovery(admin);
    await admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = admin.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await draft.getByLabel('Masa', { exact: true }).fill('7');
    await draft
      .getByLabel('Observații comandă', { exact: true })
      .fill('Notă internă sintetică exclusă din bucătărie');
    await draft.getByRole('button', { name: /Cafea sintetică/ }).click();
    await draft.getByLabel('Observație produs').fill('Fără zahăr');
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({ path: testInfo.outputPath('order-editor-360.png'), fullPage: true });

    // Commit the first request, then lose only its response. Retry must not create twice.
    const rejectedKey = await verifyNewDraftRejected(admin, draft);
    let committedId = '';
    let originalPayload = '';
    await admin.route('**/api/tenant/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      originalPayload = route.request().postData()!;
      expect(JSON.parse(originalPayload).requestKey).not.toBe(rejectedKey);
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committedId = (await response.json()).order.id;
      await route.abort('failed');
    });
    await draft.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    await expect(draft.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await expect(draft.getByLabel('Masa', { exact: true })).toBeDisabled();
    await admin.unroute('**/api/tenant/orders');
    await verifyUnknownRetryRefused(
      admin,
      draft,
      '/api/tenant/orders',
      draft.getByLabel('Masa', { exact: true }),
      originalPayload,
    );
    const replayRequest = admin.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === '/api/tenant/orders' && request.method() === 'POST',
    );
    const created = await submit(
      admin,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Reîncearcă cererea' }),
    );
    expect((await replayRequest).postData()).toBe(originalPayload);
    expect(created.order.id).toBe(committedId);
    expect(created.order.total).toBe('10.01');
    const orderId = created.order.id;
    let details = admin.getByRole('dialog', { name: 'Comanda #1', exact: true });
    await expect(details.getByText('10.01 MDL', { exact: true }).last()).toBeVisible();
    await admin.keyboard.press('Escape');
    await expect(details).not.toBeVisible();
    const list = await (await api(admin, `/orders?locationId=${location.id}`)).json();
    expect(list.orders).toHaveLength(1);
    await admin.setViewportSize({ width: 1440, height: 900 });
    await changeOperationalPrice(admin, product.id, location.id);
    await admin.reload();
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Editează', exact: true }).click();
    const edit = admin.getByRole('dialog', { name: 'Editează ciorna #1', exact: true });
    await expect(edit.getByText('10.0050 MDL', { exact: true })).toBeVisible();
    // Another operator changes the draft while this editor still has version 1.
    const concurrent = await api(
      admin,
      `/orders/${orderId}`,
      {
        version: 1,
        serviceType: 'DINE_IN',
        tableLabel: '8',
        items: [
          {
            id: created.order.items[0].id,
            productId: product.id,
            quantity: '1',
            note: 'Fără zahăr',
          },
        ],
      },
      'PATCH',
    );
    expect(concurrent.status()).toBe(200);
    const staleResponse = admin.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/tenant/orders/${orderId}` &&
        response.request().method() === 'PATCH',
    );
    await edit.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    expect((await staleResponse).status()).toBe(409);
    await expect(edit.getByText(/Datele s-au schimbat/)).toBeVisible();
    await edit.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await expect(edit.getByLabel('Masa', { exact: true })).toHaveValue('8');
    await edit.getByLabel('Cantitate', { exact: true }).fill('2');
    const update = admin.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/tenant/orders/${orderId}` &&
        response.request().method() === 'PATCH',
    );
    await edit.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    expect((await update).status()).toBe(200);
    details = admin.getByRole('dialog', { name: 'Comanda #1', exact: true });
    await expect(details.getByText('20.01 MDL', { exact: true }).last()).toBeVisible();
    const sent = await verifyUnknownSend(admin, details, orderId);
    expect(sent.order.status).toBe('CONFIRMED');
    expect(sent.ticket.batches).toEqual([
      {
        id: sent.ticket.id,
        status: 'QUEUED',
        version: 1,
        station: null,
        courseNumber: 0,
        createdAt: sent.ticket.createdAt,
        updatedAt: sent.ticket.createdAt,
        firedAt: sent.ticket.createdAt,
        ticketItemIds: sent.ticket.items.map((item: { id: string }) => item.id).sort(),
      },
    ]);
    await expect(details.getByRole('button', { name: 'Reîncarcă', exact: true })).toBeEnabled();
    await admin.keyboard.press('Escape');
    await expect(details).not.toBeVisible();
    await navigateSection(admin, 'Bucătărie');
    const ticket = admin
      .locator('article')
      .filter({ has: admin.getByRole('heading', { name: 'Comanda #1', exact: true }) });
    await expect(ticket).toContainText('Fără zahăr');
    await expect(ticket).not.toContainText('MDL');
    await expect(ticket).not.toContainText('Notă internă');
    for (const size of [
      { width: 360, height: 800 },
      { width: 768, height: 1024 },
      { width: 1920, height: 1080 },
      { width: 3840, height: 2160 },
    ]) {
      await admin.setViewportSize(size);
      await noOverflow(admin);
      await admin.screenshot({
        path: testInfo.outputPath(`kitchen-${size.width}.png`),
        fullPage: true,
      });
    }
    await admin.setViewportSize({ width: 390, height: 844 });
    await ticket.getByRole('button', { name: 'Începe prepararea' }).click();
    await expect(ticket.getByRole('button', { name: 'Marchează gata' })).toBeVisible();
    await ticket.getByRole('button', { name: 'Marchează gata' }).click();
    await expect(
      admin
        .getByRole('region', { name: 'Gata în bucătărie', exact: true })
        .getByRole('heading', { name: 'Comanda #1', exact: true }),
    ).toBeVisible();
    const persisted = await (await api(admin, `/orders/${orderId}`)).json();
    expect(persisted.order).toMatchObject({ kitchenStatus: 'READY', total: '20.01' });
    const readyBoard = await (
      await api(admin, `/kitchen/tickets?locationId=${location.id}&status=READY`)
    ).json();
    const generated = readyBoard.tickets.filter(
      (entry: { id: string }) => entry.id === sent.ticket.id,
    );
    expect(generated).toHaveLength(1);
    expect(generated[0].batches).toEqual([
      {
        ...sent.ticket.batches[0],
        status: 'READY',
        version: 3,
        updatedAt: expect.any(String),
      },
    ]);
    expect(Date.parse(generated[0].batches[0].updatedAt)).toBeGreaterThan(
      Date.parse(sent.ticket.batches[0].createdAt),
    );
    await admin
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(otherLocation.id);
    await expect(
      admin.getByText('Nu sunt tichete pentru bucătărie', { exact: true }),
    ).toBeVisible();
    await navigateSection(admin, 'Comenzi');
    await expect(
      admin.getByText('Nicio comandă în această locație', { exact: true }),
    ).toBeVisible();
    await noOverflow(admin);
    await verifyProductPagination(admin, location.id);
  } finally {
    await fixture.dispose();
  }
});
