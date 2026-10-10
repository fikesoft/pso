import { completePacking } from './support/complete-packing';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { configureProductModifiers } from './support/modifier-catalog';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('upsell POS: afișare deduplicată, produs în afara paginii, modificatori și venit confirmat', async ({
  browser,
}, info) => {
  const fixture = await operationsFixture(browser);
  const { admin, location } = fixture;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const { product: target } = await configureProductModifiers(admin, location.id);
    const source = (
      await (
        await api(admin, '/catalog/products', {
          locationId: location.id,
          name: 'Croissant declanșator',
          sku: 'UPSELL-SOURCE',
          price: '4',
        })
      ).json()
    ).product;
    const rule = (
      await (
        await api(admin, '/catalog/upsell-rules', {
          requestKey: randomUUID(),
          locationId: location.id,
          sourceProductId: source.id,
          targetProductId: target.id,
          name: 'Croissant și cafea',
        })
      ).json()
    ).rule;
    // Controlled first page omits the target. Recommendations and single-product reads stay real.
    await admin.route('**/api/tenant/catalog?*', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      await route.fulfill({
        response,
        json: {
          ...data,
          products: data.products.filter((product: { id: string }) => product.id !== target.id),
        },
      });
    });
    let lostDisplay = false;
    await admin.route('**/api/tenant/catalog/upsell-offers', async (route) => {
      if (!lostDisplay) {
        lostDisplay = true;
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('connectionfailed');
      } else await route.continue();
    });
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = admin.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await draft.getByLabel('Masa', { exact: true }).fill('24');
    await draft.getByRole('button', { name: /Croissant declanșator/ }).click();
    const recommendations = draft.getByRole('region', {
      name: 'Se potrivesc cu alegerea ta',
      exact: true,
    });
    const add = recommendations.getByRole('button', {
      name: 'Adaugă recomandarea: Cafea personalizabilă',
      exact: true,
    });
    await add.scrollIntoViewIfNeeded();
    await expect(recommendations.getByRole('alert')).toBeVisible();
    await add.click();
    const picker = draft.getByRole('region', { name: 'Alege opțiunile', exact: true });
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: 'Anulează', exact: true }).click();
    await expect(picker).not.toBeVisible();
    await add.click();
    await picker.getByRole('checkbox', { name: /Ovăz sintetic/ }).check();
    const confirm = picker.getByRole('button', { name: 'Adaugă produsul', exact: true });
    await expect(confirm).toBeEnabled();
    for (const enabled of [false, true]) {
      const current = (
        await (await api(admin, `/catalog/products/${target.id}?locationId=${location.id}`)).json()
      ).product;
      expect(
        (
          await api(
            admin,
            `/catalog/products/${target.id}/locations/${location.id}`,
            { version: current.locationVersion, price: current.price, enabled },
            'PUT',
          )
        ).status(),
      ).toBe(200);
      if (enabled) await expect(confirm).toBeEnabled();
      else await expect(confirm).toBeDisabled();
      await expect(picker.getByRole('checkbox', { name: /Ovăz sintetic/ })).toBeChecked();
    }
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('upsell-pos-360.png'), fullPage: true });
    let lostAcceptance = false;
    await admin.route('**/api/tenant/catalog/upsell-offers/*/accept', async (route) => {
      if (!lostAcceptance) {
        lostAcceptance = true;
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('connectionfailed');
      } else await route.continue();
    });
    await confirm.click();
    await expect(draft.getByRole('alert')).toBeVisible();
    await expect(picker).toBeVisible();
    await confirm.click();
    await expect(picker).not.toBeVisible();
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveCount(2);
    await expect(recommendations).not.toBeVisible();
    const created = await submit(
      admin,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(created.order.items[1].unitPrice).toBe('11.0050');
    const sent = await (
      await api(admin, `/orders/${created.order.id}/send`, {
        version: created.order.version,
        requestKey: randomUUID(),
      })
    ).json();
    for (const [index, status] of ['PREPARING', 'READY'].entries()) {
      expect(
        (
          await api(
            admin,
            `/kitchen/tickets/${sent.ticket.id}`,
            { version: sent.ticket.version + index, status },
            'PATCH',
          )
        ).status(),
      ).toBe(200);
    }
    const ready = await completePacking(admin, created.order.id);
    expect(
      (
        await api(admin, `/orders/${ready.id}/checkout/manual`, {
          version: ready.version,
          requestKey: randomUUID(),
          method: 'CASH',
          receivedAmount: ready.total,
          cashShiftId: (await fixture.cashShift()).id,
          confirmed: true,
        })
      ).status(),
    ).toBe(200);
    await admin.keyboard.press('Escape');
    await navigateSection(admin, 'Catalog');
    await admin.getByRole('button', { name: 'Reguli de recomandare', exact: true }).click();
    const card = admin
      .locator('article')
      .filter({ has: admin.getByText('Croissant și cafea', { exact: true }) });
    const results = card.getByRole('definition');
    await expect(results).toHaveText(['1', '1', '100.00%', '11.01 MDL']);
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('upsell-metrics-360.png'), fullPage: true });
    const query = new URLSearchParams({
      locationId: location.id,
      ruleIds: rule.id,
      from: new Date(Date.now() - 86400000).toISOString(),
      to: new Date(Date.now() + 1000).toISOString(),
    });
    expect(
      (await (await api(admin, `/catalog/upsell-metrics?${query}`)).json()).metrics[0],
    ).toMatchObject({ shown: '1', accepted: '1', revenue: '11.01' });
  } finally {
    await fixture.dispose();
  }
});
