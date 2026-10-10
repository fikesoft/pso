import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';
import {
  createInventoryItem,
  receiveInventory,
  configureRecipe,
  openInventoryMovement,
  inventoryCard,
  expectStockLevels,
  finalizeDemoOrder,
  stockLevel,
} from './support/inventory-flow';

test('inventar: rețetă → rezervare la bucătărie → consum la finalizare → inventariere', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await operationsFixture(browser);
  const { admin, location, otherLocation } = fixture;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    await navigateSection(admin, 'Inventar');
    const coffee = await createInventoryItem(
      admin,
      'Cafea boabe sintetică',
      'INV-COFFEE',
      'INGREDIENT',
      'G',
    );
    const sugar = await createInventoryItem(
      admin,
      'Zahăr sintetic',
      'INV-SUGAR',
      'INGREDIENT',
      'G',
    );
    const box = await createInventoryItem(admin, 'Cutie sintetică', 'INV-BOX', 'PACKAGING', 'PCS');
    const sticks = await createInventoryItem(
      admin,
      'Bețișoare sintetice',
      'INV-STICKS',
      'CONSUMABLE',
      'PCS',
    );
    for (const [item, quantity] of [
      [coffee, '100'],
      [sugar, '20'],
      [box, '5'],
      [sticks, '10'],
    ] as const) {
      await receiveInventory(admin, item.name, quantity);
    }
    await admin.route('**/api/tenant/inventory/products*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Lista produselor nu este disponibilă temporar' }),
      }),
    );
    await admin.getByText('Rețete', { exact: true }).click();
    await expect(admin.getByText('Lista produselor nu este disponibilă temporar')).toBeVisible();
    await admin.unroute('**/api/tenant/inventory/products*');
    await admin.getByRole('button', { name: 'Reîncarcă produsele', exact: true }).click();
    await configureRecipe(admin, product.id, [
      {
        inventoryItemId: coffee.id,
        purpose: 'MAIN',
        quantityPerUnit: '12.500',
        serviceTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
      },
      {
        inventoryItemId: sugar.id,
        purpose: 'AUXILIARY',
        quantityPerUnit: '2.000',
        serviceTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
      },
      {
        inventoryItemId: box.id,
        purpose: 'PACKAGING',
        quantityPerUnit: '1.000',
        serviceTypes: ['TAKEAWAY', 'DELIVERY'],
      },
      {
        inventoryItemId: sticks.id,
        purpose: 'CONSUMABLE',
        quantityPerUnit: '1.000',
        serviceTypes: ['TAKEAWAY', 'DELIVERY'],
      },
    ]);
    await admin.getByRole('button', { name: 'Editează rețeta', exact: true }).click();
    for (const width of [360, 1440]) {
      await admin.setViewportSize({ width, height: 950 });
      await noOverflow(admin);
      await admin.screenshot({
        path: testInfo.outputPath(`inventory-recipe-${width}.png`),
        fullPage: true,
      });
    }
    await admin.keyboard.press('Escape');
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = admin.getByRole('dialog');
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('TAKEAWAY');
    await draft.getByRole('button', { name: /Cafea sintetică/ }).click();
    await draft.getByLabel('Cantitate', { exact: true }).fill('2');
    const created = await submit(
      admin,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    const order = created.order;
    const details = admin.getByRole('dialog', { name: `Comanda #${order.number}`, exact: true });
    const sent = await submit(
      admin,
      `/api/tenant/orders/${order.id}/send`,
      details.getByRole('button', { name: 'Trimite la bucătărie', exact: true }),
    );
    await expect(details.getByRole('button', { name: 'Reîncarcă', exact: true })).toBeEnabled();
    await admin.keyboard.press('Escape');
    await navigateSection(admin, 'Inventar');
    const pending = [
      stockLevel(coffee, '100.000000', '25.000000', '75.000000'),
      stockLevel(sugar, '20.000000', '4.000000', '16.000000'),
      stockLevel(box, '5.000000', '2.000000', '3.000000'),
      stockLevel(sticks, '10.000000', '2.000000', '8.000000'),
    ];
    await expectStockLevels(admin, location.id, pending);
    await admin.setViewportSize({ width: 360, height: 950 });
    await noOverflow(admin);
    await admin.screenshot({ path: testInfo.outputPath('inventory-pending-360.png') });
    const countPending = inventoryCard(admin, coffee.name).getByRole('button', {
      name: 'Inventariere',
    });
    await countPending.click();
    await expect(admin.getByRole('dialog')).toContainText(
      'Stoc fizic înainte de inventariere: 100.000000',
    );
    await admin.keyboard.press('Escape');
    const beforeCheckout = await (
      await api(admin, `/inventory/movements?locationId=${location.id}&kind=CONSUMPTION`)
    ).json();
    expect(beforeCheckout.movements).toHaveLength(0);
    await admin.reload();
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(admin, 'Inventar');
    await expectStockLevels(admin, location.id, pending);
    await finalizeDemoOrder(admin, order, sent.ticket);
    await navigateSection(admin, 'Inventar');
    await expectStockLevels(
      admin,
      location.id,
      pending.map((item) => ({
        ...item,
        balance: item.availableQuantity,
        reservedQuantity: '0.000000',
      })),
    );
    await admin.getByText('Mișcări', { exact: true }).click();
    const ledger = await (
      await api(admin, `/inventory/movements?locationId=${location.id}&kind=CONSUMPTION`)
    ).json();
    expect(ledger.movements).toHaveLength(4);
    expect(
      ledger.movements.every(
        (entry: { document: { orderId: string }; productName: string }) =>
          entry.document.orderId === order.id && entry.productName === 'Cafea sintetică',
      ),
    ).toBe(true);
    await expect(
      admin.getByRole('article').filter({ hasText: 'Consum la finalizarea comenzii' }).first(),
    ).toBeVisible();
    for (const width of [360, 390, 768, 1440]) {
      await admin.setViewportSize({ width, height: 950 });
      await noOverflow(admin);
      await admin.screenshot({
        path: testInfo.outputPath(`inventory-ledger-${width}.png`),
        fullPage: true,
      });
    }
    await admin.getByText('Stoc', { exact: true }).click();
    const count = await openInventoryMovement(
      admin,
      coffee.name,
      'Inventariere',
      '70',
      'Numărare fizică sintetică',
    );
    await admin.route('**/api/tenant/inventory/documents', (route) => route.abort('failed'));
    await count.getByRole('button', { name: 'Înregistrează mișcarea', exact: true }).click();
    await expect(
      count.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    ).toBeVisible();
    await admin.unroute('**/api/tenant/inventory/documents');
    const concurrent = await api(admin, '/inventory/documents', {
      locationId: location.id,
      inventoryItemId: coffee.id,
      kind: 'RECEIPT',
      quantity: '1',
      reason: 'Intrare concurentă sintetică',
      requestKey: randomUUID(),
    });
    expect(concurrent.status()).toBe(200);
    const rejected = admin.waitForResponse(
      (response) =>
        response.url().endsWith('/inventory/documents') && response.request().method() === 'POST',
    );
    await count.getByRole('button', { name: 'Reîncearcă cererea', exact: true }).click();
    const staleCountResponse = await rejected;
    expect(staleCountResponse.status()).toBe(409);
    expect((await staleCountResponse.json()).code).toBe('INVENTORY_COUNT_STALE');
    await expect(count.getByText(/Stocul s-a modificat/)).toBeVisible();
    await count.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await count.getByLabel('Cantitate numărată', { exact: true }).fill('70');
    await submit(
      admin,
      '/api/tenant/inventory/documents',
      count.getByRole('button', { name: 'Înregistrează mișcarea', exact: true }),
    );
    await expect(count).not.toBeVisible();
    const receipt = await openInventoryMovement(
      admin,
      coffee.name,
      'Intrare în stoc',
      '2',
      'Răspuns pierdut sintetic',
    );
    await admin.route('**/api/tenant/inventory/documents', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    });
    await receipt.getByRole('button', { name: 'Înregistrează mișcarea', exact: true }).click();
    await expect(
      receipt.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    ).toBeVisible();
    await expect(receipt.getByLabel('Cantitate', { exact: true })).toBeDisabled();
    await admin.unroute('**/api/tenant/inventory/documents');
    await admin.route('**/api/tenant/inventory/documents', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Acces refuzat sintetic după răspuns pierdut' }),
      }),
    );
    await receipt.getByRole('button', { name: 'Reîncearcă cererea', exact: true }).click();
    await expect(receipt.getByText('Acces refuzat sintetic după răspuns pierdut')).toBeVisible();
    await expect(receipt.getByLabel('Cantitate', { exact: true })).toBeDisabled();
    await expect(
      receipt.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    ).toBeEnabled();
    await admin.unroute('**/api/tenant/inventory/documents');
    const replay = await submit(
      admin,
      '/api/tenant/inventory/documents',
      receipt.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    );
    expect(replay.balance).toBe('72.000000');
    await expect(receipt).not.toBeVisible();
    const waste = await openInventoryMovement(
      admin,
      box.name,
      'Pierdere',
      '4',
      'Ambalaje deteriorate sintetic',
    );
    await submit(
      admin,
      '/api/tenant/inventory/documents',
      waste.getByRole('button', { name: 'Înregistrează mișcarea', exact: true }),
    );
    await expect(waste).not.toBeVisible();
    await expect(
      inventoryCard(admin, box.name).getByText('Stoc negativ', { exact: true }),
    ).toBeVisible();
    const negative = await (
      await api(admin, `/inventory/items/${box.id}?locationId=${location.id}`)
    ).json();
    expect(negative.item.balance).toBe('-1.000000');
    await admin.reload();
    await admin
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(otherLocation.id);
    await navigateSection(admin, 'Inventar');
    const otherStock = await (
      await api(admin, `/inventory/items?locationId=${otherLocation.id}`)
    ).json();
    expect(otherStock.items.every((item: { balance: string }) => item.balance === '0.000000')).toBe(
      true,
    );
    await noOverflow(admin);
  } finally {
    await fixture.dispose();
  }
});
