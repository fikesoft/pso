import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, session, submit } from './support/browser-helpers';

test('livrare: cerere nelivrată și retry 409 permit reîncărcarea versiunii concurente', async ({
  browser,
}) => {
  const f = await operationsFixture(browser);
  const { admin, location } = f;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    const courierId = (await session(admin)).user.id;
    const created = await api(admin, '/orders', {
      locationId: location.id,
      serviceType: 'DELIVERY',
      requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: '1' }],
    });
    expect(created.status()).toBe(200);
    const order = (await created.json()).order;
    const confirmed = await api(admin, `/orders/${order.id}/confirm`, {
      version: order.version,
      requestKey: randomUUID(),
    });
    expect(confirmed.status()).toBe(200);
    const path = `/api/tenant/orders/${order.id}/delivery`;
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: 'Comanda #1', exact: true });
    const delivery = dialog.getByRole('region', { name: 'Livrare', exact: true });
    await delivery.getByRole('combobox', { name: 'Curier', exact: true }).selectOption(courierId);
    let originalPayload = '';
    await admin.route(`**${path}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      originalPayload = route.request().postData()!;
      await route.abort('failed');
    });
    await delivery.getByRole('button', { name: 'Actualizează livrarea', exact: true }).click();
    await expect(delivery.getByText(/Rezultatul livrării este necunoscut/)).toBeVisible();
    const competing = await api(admin, `/orders/${order.id}/delivery`, {
      version: (await confirmed.json()).order.version,
      requestKey: randomUUID(),
      status: 'FAILED',
      reason: 'Cursă oprită de dispecer',
    });
    expect(competing.status()).toBe(200);
    await admin.unroute(`**${path}`);
    const rejected = admin.waitForResponse(
      (r) => r.url().endsWith(path) && r.request().method() === 'POST',
    );
    await delivery.getByRole('button', { name: 'Reîncearcă aceeași livrare', exact: true }).click();
    const response = await rejected;
    expect(response.status()).toBe(409);
    expect(response.request().postData()).toBe(originalPayload);
    await expect(delivery.getByText(/Rezultatul livrării este necunoscut/)).toHaveCount(0);
    await expect(
      delivery.getByRole('button', { name: 'Actualizează livrarea', exact: true }),
    ).toBeDisabled();
    await delivery.getByRole('button', { name: 'Reîncarcă livrarea', exact: true }).click();
    await expect(delivery.getByText('Cursă oprită de dispecer', { exact: true })).toBeVisible();
    await delivery.getByLabel('Motivul livrării', { exact: true }).fill('Reluare după verificare');
    const restored = await submit(
      admin,
      path,
      delivery.getByRole('button', { name: 'Actualizează livrarea', exact: true }),
    );
    expect(restored.order.deliveryStatus).toBe('WAITING_COURIER');
    const history = (await (await api(admin, `/orders/${order.id}/delivery`)).json()).operations;
    expect(history).toHaveLength(2);
    expect(history.every((op: { toStatus: string }) => op.toStatus !== 'ASSIGNED')).toBe(true);
    await admin.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});
