import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow } from './support/browser-helpers';
import { deliveryZoneProfile } from '../../packages/db/test/fixtures/delivery-zone.fixture';

test('tarif comandă: confirmare explicită, răspuns pierdut, recuperare după reîncărcare și responsive', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser),
    page = f.admin;
  try {
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    const product = await createOperationalProduct(page);
    expect(
      (
        await api(page, `/delivery-zones/${randomUUID()}/commands`, {
          action: 'CREATE',
          locationId: f.location.id,
          requestKey: randomUUID(),
          profile: { ...deliveryZoneProfile(), minimumOrder: '0.00' },
        })
      ).status(),
    ).toBe(200);
    const response = await api(page, '/orders', {
      locationId: f.location.id,
      requestKey: randomUUID(),
      serviceType: 'DELIVERY',
      deliveryAddress: { address: 'Adresă sintetică E2E tarif' },
      items: [{ productId: product.id, quantity: '1' }],
    });
    expect(response.status()).toBe(200);
    const { order } = await response.json();
    await navigateSection(page, 'Comenzi');
    await page.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    const dialog = page.getByRole('dialog'),
      fee = dialog.getByRole('region', { name: 'Tarif de livrare al comenzii', exact: true });
    await fee.getByLabel('Latitudine', { exact: true }).fill('0');
    await fee.getByLabel('Longitudine', { exact: true }).fill('0');
    await fee.getByRole('button', { name: 'Calculează tariful', exact: true }).click();
    await expect(
      fee.getByText('Destinația nu este acoperită de o zonă activă.', { exact: true }),
    ).toBeVisible();
    await fee.getByLabel('Latitudine', { exact: true }).fill('47.02');
    await fee.getByLabel('Longitudine', { exact: true }).fill('28.83');
    await fee.getByRole('button', { name: 'Calculează tariful', exact: true }).click();
    await expect(
      fee.getByText(
        'Subtotal produse: 10.01 MDL · Tarif de livrare: 25.00 MDL · Total: 35.01 MDL',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(fee.getByRole('button', { name: 'Aplică tariful', exact: true })).toBeDisabled();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await fee.scrollIntoViewIfNeeded();
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`order-fee-${width}.png`), fullPage: true });
    }
    const path = `/api/tenant/orders/${order.id}/delivery-fee`;
    await page.route(`**${path}`, async (route) => {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await fee.getByLabel('Confirm destinația și totalul cu livrare', { exact: true }).check();
    await fee.getByRole('button', { name: 'Aplică tariful', exact: true }).click();
    await expect(fee.getByText(/Rezultatul confirmării este necunoscut/)).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Editează ciorna', exact: true }),
    ).toBeDisabled();
    const stored = await page.evaluate(() =>
      Object.entries(sessionStorage)
        .filter(([key]) => key.startsWith('pos.order-delivery-fee:'))
        .map(([, value]) => JSON.parse(value)),
    );
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0])).toEqual(['requestKey']);
    await page.unroute(`**${path}`);
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Comenzi');
    await page.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    await fee.getByRole('button', { name: 'Verifică rezultatul tarifului', exact: true }).click();
    await expect(fee.getByText('Tarif confirmat', { exact: true })).toBeVisible();
    await expect(
      dialog.locator('.operation-total').getByText('35.01 MDL', { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Editează ciorna', exact: true }),
    ).toBeEnabled();
    await fee.getByLabel('Latitudine', { exact: true }).fill('47.021');
    await fee.getByLabel('Longitudine', { exact: true }).fill('28.83');
    await fee.getByRole('button', { name: 'Calculează tariful', exact: true }).click();
    await fee.getByLabel('Confirm destinația și totalul cu livrare', { exact: true }).check();
    await page.route(`**${path}`, (route) => route.abort('failed'));
    await fee.getByRole('button', { name: 'Aplică tariful', exact: true }).click();
    await expect(fee.getByText(/Rezultatul confirmării este necunoscut/)).toBeVisible();
    await page.unroute(`**${path}`);
    await fee.getByRole('button', { name: 'Verifică rezultatul tarifului', exact: true }).click();
    await expect(
      fee.getByText('Tentativa nu a fost aplicată și a fost retrasă. Puteți recalcula.', {
        exact: true,
      }),
    ).toBeVisible();
    await fee.getByRole('button', { name: 'Calculează tariful', exact: true }).click();
    await fee.getByLabel('Confirm destinația și totalul cu livrare', { exact: true }).check();
    let original = '';
    await page.route(`**${path}`, async (route) => {
      original = route.request().postData()!;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await fee.getByRole('button', { name: 'Aplică tariful', exact: true }).click();
    await expect(fee.getByText(/Rezultatul confirmării este necunoscut/)).toBeVisible();
    await page.unroute(`**${path}`);
    const retry = page.waitForRequest((request) => request.url().endsWith(path));
    await fee.getByRole('button', { name: 'Reîncearcă aceeași confirmare', exact: true }).click();
    expect((await retry).postData()).toBe(original);
    await expect(fee.getByText('Tariful a fost aplicat.', { exact: true })).toBeVisible();
  } finally {
    await f.dispose();
  }
});
