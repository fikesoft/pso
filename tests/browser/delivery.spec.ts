import { completePacking } from './support/complete-packing';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, session, submit } from './support/browser-helpers';

test('livrare: atribuire, retry identic, eșec și reluare până la livrat pe mobil', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser);
  const { admin, location } = f;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    const courierId = (await session(admin)).user.id;
    const response = await api(admin, '/orders', {
      locationId: location.id,
      serviceType: 'DELIVERY',
      requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: '1' }],
    });
    expect(response.status()).toBe(200);
    const order = (await response.json()).order;
    const path = `/api/tenant/orders/${order.id}`;
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: 'Comanda #1', exact: true });
    const delivery = dialog.getByRole('region', { name: 'Livrare', exact: true });
    await expect(
      delivery.getByText('Nu există operațiuni de livrare.', { exact: true }),
    ).toBeVisible();
    await submit(
      admin,
      `${path}/confirm`,
      dialog.getByRole('button', { name: 'Confirmă fără trimitere', exact: true }),
    );
    await delivery.getByRole('combobox', { name: 'Curier', exact: true }).selectOption(courierId);
    let originalPayload = '';
    await admin.route(`**${path}/delivery`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      originalPayload = route.request().postData()!;
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      await route.abort('failed');
    });
    await delivery.getByRole('button', { name: 'Actualizează livrarea', exact: true }).click();
    await expect(delivery.getByText(/Rezultatul livrării este necunoscut/)).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Trimite la bucătărie', exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Încasează o tranșă', exact: true }),
    ).toBeDisabled();
    await expect(
      delivery.getByRole('button', { name: 'Reîncarcă livrarea', exact: true }),
    ).toBeDisabled();
    await admin.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('delivery-uncertain-360.png'), fullPage: true });
    await admin.unroute(`**${path}/delivery`);
    const retry = admin.waitForRequest(
      (r) => r.url().endsWith(`${path}/delivery`) && r.method() === 'POST',
    );
    const assigned = await submit(
      admin,
      `${path}/delivery`,
      delivery.getByRole('button', { name: 'Reîncearcă aceeași livrare', exact: true }),
    );
    expect((await retry).postData()).toBe(originalPayload);
    expect(assigned.order).toMatchObject({
      deliveryStatus: 'ASSIGNED',
      paymentStatus: 'UNPAID',
      status: 'CONFIRMED',
    });
    expect(
      (await (await api(admin, `/orders/${order.id}/delivery`)).json()).operations,
    ).toHaveLength(1);
    const transition = async (status: string, reason?: string) => {
      await delivery
        .getByRole('combobox', { name: 'Starea următoare', exact: true })
        .selectOption(status);
      if (reason) await delivery.getByLabel('Motivul livrării', { exact: true }).fill(reason);
      return submit(
        admin,
        `${path}/delivery`,
        delivery.getByRole('button', { name: 'Actualizează livrarea', exact: true }),
      );
    };
    await transition('FAILED', 'Client indisponibil');
    await expect(delivery.getByText('Client indisponibil', { exact: true })).toBeVisible();
    await transition('WAITING_COURIER', 'Clientul a revenit');
    await delivery.getByRole('combobox', { name: 'Curier', exact: true }).selectOption(courierId);
    await transition('ASSIGNED');
    const sent = await submit(
      admin,
      `${path}/send`,
      dialog.getByRole('button', { name: 'Trimite la bucătărie', exact: true }),
    );
    for (const [index, status] of ['PREPARING', 'READY'].entries()) {
      expect(
        (
          await api(
            admin,
            `/kitchen/tickets/${sent.ticket.id}`,
            { version: index + 1, status },
            'PATCH',
          )
        ).status(),
      ).toBe(200);
    }
    await completePacking(admin, order.id);
    await delivery.getByRole('button', { name: 'Reîncarcă livrarea', exact: true }).click();
    await transition('PICKED_UP');
    await transition('DELIVERING');
    const delivered = await transition('DELIVERED');
    expect(delivered.order).toMatchObject({
      deliveryStatus: 'DELIVERED',
      status: 'READY',
      paymentStatus: 'UNPAID',
    });
    await submit(
      admin,
      `${path}/complete`,
      dialog.getByRole('button', { name: 'Finalizează comanda', exact: true }),
    );
    const current = (await (await api(admin, `/orders/${order.id}`)).json()).order;
    expect(current).toMatchObject({
      deliveryStatus: 'DELIVERED',
      status: 'COMPLETED',
      paymentStatus: 'UNPAID',
    });
    await noOverflow(admin);
    await delivery.getByText('Livrare', { exact: true }).scrollIntoViewIfNeeded();
    await admin.screenshot({ path: info.outputPath('delivery-complete-360.png'), fullPage: true });
    await admin.keyboard.press('Escape');
    await admin.reload();
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    await expect(delivery.getByText('Livrată', { exact: true })).toBeVisible();
    await expect(
      delivery.getByRole('button', { name: 'Actualizează livrarea', exact: true }),
    ).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});
