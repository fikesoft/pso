import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { createDeliverySandbox } from '../../scripts/delivery-sandbox/model/server';
import { close, listen } from '../support/storefront-fixture';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct, changeOperationalPrice } from './support/operations-catalog';
import {
  api,
  localOnly,
  navigateSection,
  noOverflow,
  session,
  submit,
} from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';
import { finalizeDemoOrder } from './support/inventory-flow';
import {
  connectWebsite,
  openWebsiteOrder,
  recoverUnavailableWebsiteOrder,
  websitePackaging,
} from './support/website-flow';

test('website: Cumpără → inbox → acceptare → bucătărie, cheie privată și retry fără duplicat', async ({
  browser,
}, info) => {
  const fixture = await operationsFixture(browser);
  const { admin, location } = fixture;
  const visitorContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await localOnly(visitorContext);
  let storefront: ReturnType<typeof createDeliverySandbox> | undefined;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    const currentProduct = await (
      await api(admin, `/catalog/products/${product.id}?locationId=${location.id}`)
    ).json();
    const auth = await session(admin);
    const uploaded = await admin.request.put(
      `${tenantOrigin}/api/tenant/catalog/products/${product.id}/image?version=${currentProduct.product.version}&requestKey=${randomUUID()}`,
      {
        headers: {
          origin: tenantOrigin,
          'x-csrf-token': auth.csrfToken,
          'content-type': 'image/png',
        },
        data: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFElEQVQImWM448JwxoUBhM+4MAAAIP4EQeprLZYAAAAASUVORK5CYII=',
          'base64',
        ),
      },
    );
    expect(uploaded.status()).toBe(200);
    const boxId = await websitePackaging(admin, location.id, product.id);
    const issued = await connectWebsite(admin);
    storefront = createDeliverySandbox({
      apiKey: issued.apiKey,
      posOrigin: 'http://127.0.0.1:4000',
    });
    const origin = await listen(storefront);
    const visitor = await visitorContext.newPage();
    const leaked: string[] = [];
    visitor.on('request', (request) => {
      if (
        `${request.url()}${JSON.stringify(request.headers())}${request.postData()}`.includes(
          issued.apiKey,
        )
      )
        leaked.push('request');
    });
    await visitor.goto(origin);
    const buy = visitor.getByRole('button', { name: 'Cumpără Cafea sintetică', exact: true });
    await expect(buy).toBeVisible();
    await expect(visitor.getByText('Cafea sintetică — 10.01 MDL', { exact: true })).toBeVisible();
    const image = visitor.getByRole('img', { name: 'Cafea sintetică', exact: true });
    await expect(image).toHaveAttribute(
      'src',
      new RegExp(`^/api/catalog/products/${product.id}/image\\?assetId=`),
    );
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(2);
    const imagePath = await image.getAttribute('src');
    expect(await visitor.content()).not.toContain(issued.apiKey);
    await noOverflow(visitor);
    let purchasePayload = '';
    let receipt: { id: string; externalOrderId: string; total: string };
    await visitor.route('**/api/buy', async (route) => {
      purchasePayload = route.request().postData()!;
      const response = await route.fetch();
      expect([200, 201]).toContain(response.status());
      receipt = (await response.json()).receipt;
      await route.abort('failed');
    });
    await buy.click();
    await expect(
      visitor.getByRole('button', { name: 'Reîncearcă aceeași comandă', exact: true }),
    ).toBeEnabled();
    await expect(buy).toBeDisabled();
    await visitor.unroute('**/api/buy');
    await visitor.route('**/api/buy', async (route) => {
      expect(route.request().postData()).toBe(purchasePayload);
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'POS_REQUEST_REJECTED' }),
      });
    });
    await visitor.getByRole('button', { name: 'Reîncearcă aceeași comandă', exact: true }).click();
    await expect(visitor.getByRole('status')).toContainText('Cererea a fost respinsă');
    await expect(buy).toBeDisabled();
    await visitor.unroute('**/api/buy');
    await changeOperationalPrice(admin, product.id, location.id);
    await visitor.reload();
    await expect(buy).toBeDisabled();
    const replay = await submit(
      visitor,
      '/api/buy',
      visitor.getByRole('button', { name: 'Reîncearcă aceeași comandă', exact: true }),
    );
    expect(replay.receipt.id).toBe(receipt!.id);
    expect(replay.receipt.total).toBe('10.01');
    expect(
      await visitor.evaluate(() => JSON.stringify({ ...window.sessionStorage })),
    ).not.toContain(issued.apiKey);
    expect(leaked).toEqual([]);
    const inbox = await (await api(admin, `/website/orders?locationId=${location.id}`)).json();
    expect(inbox.orders).toHaveLength(1);
    await navigateSection(admin, 'Livrări website');
    let dialog = await openWebsiteOrder(admin, receipt!.externalOrderId);
    await expect(dialog).toContainText('Client website sintetic');
    for (const width of [360, 390, 768, 1440]) {
      await admin.setViewportSize({ width, height: 950 });
      await noOverflow(admin);
      await admin.screenshot({
        path: info.outputPath(`website-inbox-${width}.png`),
        fullPage: true,
      });
    }
    const acceptPath = `/api/tenant/website/orders/${receipt!.id}/accept`;
    let acceptPayload = '';
    let acceptedOrderId = '';
    await admin.route(`**${acceptPath}`, async (route) => {
      acceptPayload = route.request().postData()!;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      acceptedOrderId = (await response.json()).orderId;
      await route.abort('failed');
    });
    await dialog.getByRole('button', { name: 'Acceptă comanda', exact: true }).click();
    await expect(dialog.getByText(/Rezultatul nu este confirmat/)).toBeVisible();
    await admin.unroute(`**${acceptPath}`);
    await admin.route(`**${acceptPath}`, async (route) => {
      expect(route.request().postData()).toBe(acceptPayload);
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Refuz sintetic după acceptare' }),
      });
    });
    await dialog
      .getByRole('button', { name: 'Reîncearcă aceeași solicitare', exact: true })
      .click();
    await expect(dialog.getByText('Refuz sintetic după acceptare')).toBeVisible();
    await admin.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await admin.unroute(`**${acceptPath}`);
    const accepted = await submit(
      admin,
      acceptPath,
      dialog.getByRole('button', { name: 'Reîncearcă aceeași solicitare', exact: true }),
    );
    expect(accepted.orderId).toBe(acceptedOrderId);
    await expect(dialog.getByText(/Comanda a fost acceptată/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Vezi comenzile POS', exact: true }).click();
    const orderResponse = await (await api(admin, `/orders/${acceptedOrderId}`)).json();
    expect(orderResponse.order).toMatchObject({
      total: '10.01',
      status: 'DRAFT',
      serviceType: 'DELIVERY',
      notes: null,
    });
    await admin
      .getByRole('article')
      .filter({
        has: admin.getByRole('heading', {
          name: `Comanda #${orderResponse.order.number}`,
          exact: true,
        }),
      })
      .getByRole('button', { name: 'Deschide comanda', exact: true })
      .click();
    dialog = admin.getByRole('dialog', {
      name: `Comanda #${orderResponse.order.number}`,
      exact: true,
    });
    const sent = await submit(
      admin,
      `/api/tenant/orders/${acceptedOrderId}/send`,
      dialog.getByRole('button', { name: 'Trimite la bucătărie', exact: true }),
    );
    const stock = await (
      await api(admin, `/inventory/items/${boxId}?locationId=${location.id}`)
    ).json();
    expect(stock.item).toMatchObject({
      balance: '5.000000',
      reservedQuantity: '1.000000',
      availableQuantity: '4.000000',
    });
    await admin.keyboard.press('Escape');
    await finalizeDemoOrder(admin, sent.order, sent.ticket);
    const consumed = await (
      await api(admin, `/inventory/items/${boxId}?locationId=${location.id}`)
    ).json();
    expect(consumed.item).toMatchObject({
      balance: '4.000000',
      reservedQuantity: '0.000000',
      availableQuantity: '4.000000',
    });
    await navigateSection(admin, 'Livrări website');
    await visitor.getByRole('button', { name: 'Reîncarcă produsele', exact: true }).click();
    const second = await submit(visitor, '/api/buy', buy);
    expect(second.receipt.total).toBe('20.00');
    dialog = await openWebsiteOrder(admin, second.receipt.externalOrderId);
    await recoverUnavailableWebsiteOrder(admin, dialog, second.receipt.id, product.id, location.id);
    await dialog.getByRole('button', { name: 'Respinge comanda', exact: true }).click();
    await dialog.getByLabel('Motivul respingerii').fill('Client sintetic a anulat');
    const rejected = await submit(
      admin,
      `/api/tenant/website/orders/${second.receipt.id}/reject`,
      dialog.getByRole('button', { name: 'Confirmă respingerea', exact: true }),
    );
    expect(rejected.websiteOrder.status).toBe('REJECTED');
    expect(rejected.orderId).toBeNull();
    await admin.keyboard.press('Escape');
    await admin.getByRole('button', { name: 'Revocă cheia', exact: true }).click();
    dialog = admin.getByRole('dialog', { name: 'Revocarea cheii API', exact: true });
    const revoked = admin.waitForResponse(
      (response) =>
        response.url().endsWith(`/website/keys/${issued.key.id}`) &&
        response.request().method() === 'DELETE',
    );
    await dialog.getByRole('button', { name: 'Confirmă revocarea', exact: true }).click();
    expect((await revoked).status()).toBe(200);
    await expect(dialog).not.toBeVisible();
    const denied = visitor.waitForResponse((response) => response.url().endsWith('/api/products'));
    await visitor.getByRole('button', { name: 'Reîncarcă produsele', exact: true }).click();
    expect((await denied).status()).toBe(401);
    expect((await visitor.request.get(new URL(imagePath!, origin).toString())).status()).toBe(401);
    await expect(buy).toHaveCount(0);
    await noOverflow(visitor);
  } finally {
    await visitorContext.close();
    if (storefront) await close(storefront);
    await fixture.dispose();
  }
});
