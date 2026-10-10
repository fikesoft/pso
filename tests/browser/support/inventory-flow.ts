import { completePacking } from './complete-packing';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type {
  InventoryKind,
  InventoryUnit,
  InventoryItem,
  CreateRecipeRequest,
} from '../../../packages/contracts/src';
import { submit } from './browser-helpers';
import { api, navigateSection } from './browser-helpers';

interface StockExpectation {
  id: string;
  name: string;
  balance: string;
  reservedQuantity: string;
  availableQuantity: string;
}

export function stockLevel(
  item: Pick<InventoryItem, 'id' | 'name'>,
  balance: string,
  reservedQuantity: string,
  availableQuantity: string,
): StockExpectation {
  return { id: item.id, name: item.name, balance, reservedQuantity, availableQuantity };
}

export async function expectStockLevels(
  page: Page,
  locationId: string,
  expected: StockExpectation[],
) {
  const response = await api(page, `/inventory/items?locationId=${locationId}`);
  expect(response.status()).toBe(200);
  const stock = (await response.json()) as { items: InventoryItem[] };
  for (const values of expected) {
    const item = stock.items.find((entry) => entry.id === values.id);
    expect(item, values.name).toMatchObject({
      balance: values.balance,
      reservedQuantity: values.reservedQuantity,
      availableQuantity: values.availableQuantity,
    });
    const card = inventoryCard(page, values.name);
    await expect(card).toContainText(`Stoc fizic: ${values.balance}`);
    await expect(card).toContainText(
      `Rezervat pentru comenzi în așteptare: ${values.reservedQuantity}`,
    );
    await expect(card).toContainText(`Disponibil: ${values.availableQuantity}`);
  }
}

export async function finalizeDemoOrder(
  page: Page,
  order: { id: string; number: number },
  ticket: { id: string; version: number },
) {
  for (const status of ['PREPARING', 'READY']) {
    const result = await api(
      page,
      `/kitchen/tickets/${ticket.id}`,
      { status, version: ticket.version },
      'PATCH',
    );
    expect(result.status()).toBe(200);
    ticket = (await result.json()).ticket;
  }
  await completePacking(page, order.id);
  await navigateSection(page, 'Comenzi');
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: `Comanda #${order.number}`, exact: true }) })
    .getByRole('button', { name: 'Deschide comanda' })
    .click();
  await page.getByRole('button', { name: 'Bon fictiv', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Bon fictiv', exact: true });
  await dialog.getByRole('checkbox', { name: 'Confirm închiderea definitivă ca DEMO' }).check();
  const completed = await submit(
    page,
    `/api/tenant/orders/${order.id}/checkout/demo`,
    dialog.getByRole('button', { name: 'Finalizează cu bon fictiv' }),
  );
  expect(completed.order.status).toBe('COMPLETED');
  await page.keyboard.press('Escape');
}

export function inventoryCard(page: Page, name: string) {
  return page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}
export async function createInventoryItem(
  page: Page,
  name: string,
  sku: string,
  kind: InventoryKind,
  unit: InventoryUnit,
) {
  await page.getByRole('button', { name: 'Articol nou', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Denumire articol', { exact: true }).fill(name);
  await dialog.getByLabel('Cod articol', { exact: true }).fill(sku);
  await dialog.getByLabel('Tip articol', { exact: true }).selectOption(kind);
  await dialog.getByLabel('Unitate de măsură', { exact: true }).selectOption(unit);
  const result = await submit(
    page,
    '/api/tenant/inventory/items',
    dialog.getByRole('button', { name: 'Creează articolul', exact: true }),
  );
  await expect(dialog).not.toBeVisible();
  return result.item as InventoryItem;
}
export async function openInventoryMovement(
  page: Page,
  name: string,
  action: string,
  quantity: string,
  reason: string,
) {
  await inventoryCard(page, name).getByRole('button', { name: action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel(action === 'Inventariere' ? 'Cantitate numărată' : 'Cantitate', { exact: true })
    .fill(quantity);
  await dialog.getByLabel('Motiv', { exact: true }).fill(reason);
  return dialog;
}
export async function receiveInventory(page: Page, name: string, quantity: string) {
  const dialog = await openInventoryMovement(
    page,
    name,
    'Intrare în stoc',
    quantity,
    'Stoc inițial sintetic',
  );
  await submit(
    page,
    '/api/tenant/inventory/documents',
    dialog.getByRole('button', { name: 'Înregistrează mișcarea', exact: true }),
  );
  await expect(dialog).not.toBeVisible();
}
export async function configureRecipe(
  page: Page,
  productId: string,
  components: CreateRecipeRequest['components'],
) {
  await page.getByText('Rețete', { exact: true }).click();
  await page.getByLabel('Produs', { exact: true }).selectOption(productId);
  await page.getByRole('button', { name: 'Editează rețeta', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const [index, line] of components.entries()) {
    await dialog.getByRole('button', { name: 'Adaugă componentă', exact: true }).click();
    const group = dialog.getByRole('group', { name: `Componentă ${index + 1}`, exact: true });
    await group.getByLabel('Articol', { exact: true }).selectOption(line.inventoryItemId);
    await group.getByLabel('Rol în rețetă', { exact: true }).selectOption(line.purpose);
    await group.getByLabel('Cantitate per produs', { exact: true }).fill(line.quantityPerUnit);
    await group
      .getByRole('checkbox', { name: 'La masă', exact: true })
      .setChecked(line.serviceTypes.includes('DINE_IN'));
    await group
      .getByRole('checkbox', { name: 'La pachet', exact: true })
      .setChecked(line.serviceTypes.includes('TAKEAWAY'));
    await group
      .getByRole('checkbox', { name: 'Livrare', exact: true })
      .setChecked(line.serviceTypes.includes('DELIVERY'));
  }
  await dialog
    .getByLabel('Motivul versiunii', { exact: true })
    .fill('Rețetă sintetică: ingrediente și ambalare');
  await submit(
    page,
    `/api/tenant/inventory/recipes/${productId}`,
    dialog.getByRole('button', { name: 'Salvează versiunea rețetei', exact: true }),
  );
  await expect(dialog).not.toBeVisible();
}
