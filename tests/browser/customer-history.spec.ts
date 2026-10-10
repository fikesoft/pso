import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow } from './support/browser-helpers';

test('istoric CRM: legături explicite, paginare, filtre, snapshot și revocare responsive', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser);
  const page = f.admin;
  try {
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    const product = await createOperationalProduct(page);
    const registered = await api(page, '/customers', {
      locationId: f.location.id,
      requestKey: randomUUID(),
      name: 'Client istoric',
      phone: '060654321',
    });
    expect(registered.status()).toBe(200);
    const { customer } = await registered.json();
    for (let i = 0; i < 21; i++) {
      const response = await api(page, '/orders', {
        locationId: f.location.id,
        requestKey: randomUUID(),
        serviceType: 'PICKUP',
        customerRef: { id: customer.id, version: 1 },
        items: [{ productId: product.id, quantity: '1' }],
      });
      expect(response.status()).toBe(200);
    }
    expect(
      (
        await api(page, '/orders', {
          locationId: f.location.id,
          requestKey: randomUUID(),
          serviceType: 'PICKUP',
          customer: { name: customer.name, phone: customer.phone },
          items: [{ productId: product.id, quantity: '1' }],
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await api(page, `/customers/${customer.id}/commands`, {
          locationId: f.location.id,
          requestKey: randomUUID(),
          action: 'UPDATE',
          version: 1,
          profile: { name: 'Profil nou', phone: customer.phone, email: null },
        })
      ).status(),
    ).toBe(200);
    await navigateSection(page, 'Clienți');
    await page.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    const history = page.getByRole('region', {
      name: 'Istoricul comenzilor clientului',
      exact: true,
    });
    await expect(history.getByRole('article')).toHaveCount(20);
    await history
      .getByRole('button', { name: 'Mai multe comenzi ale clientului', exact: true })
      .click();
    await expect(history.getByRole('article')).toHaveCount(21);
    await history.getByText('Articole și date istorice', { exact: true }).first().click();
    await expect(
      history.getByText('Client istoric · 060654321', { exact: true }).first(),
    ).toBeVisible();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await history.getByRole('article').first().scrollIntoViewIfNeeded();
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`customer-history-${width}.png`),
        fullPage: true,
      });
    }
    await history.getByLabel('Starea comenzilor clientului').selectOption('COMPLETED');
    await expect(history.getByRole('article')).toHaveCount(0);
    await expect(history.getByText('Nicio comandă vizibilă în această pagină.')).toBeVisible();
    await history.getByLabel('Starea comenzilor clientului').selectOption('DRAFT');
    await expect(history.getByRole('article')).toHaveCount(20);
    const path = `/api/tenant/customers/${customer.id}/orders`;
    await page.route(`**${path}?**`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Istoric temporar indisponibil' }),
      }),
    );
    await history.getByRole('button', { name: 'Reîncarcă istoricul', exact: true }).click();
    await expect(history.getByRole('article')).toHaveCount(0);
    await expect(history.getByText('Istoric temporar indisponibil', { exact: true })).toBeVisible();
    await page.unroute(`**${path}?**`);
    await history.getByRole('button', { name: 'Reîncarcă istoricul', exact: true }).click();
    await expect(history.getByRole('article')).toHaveCount(20);
    await page.route(`**${path}?**`, (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Acces retras' }),
      }),
    );
    await history.getByRole('button', { name: 'Reîncarcă istoricul', exact: true }).click();
    await expect(history.getByRole('article')).toHaveCount(0);
    await expect(history.getByText('Acces retras', { exact: true })).toBeVisible();
  } finally {
    await f.dispose();
  }
});
