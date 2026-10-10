import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, localOnly, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

export async function operatorFixture(browser: Browser, readOrders = true) {
  const f = await operationsFixture(browser);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await localOnly(context);
  const operator = await context.newPage();
  const reads: string[] = [];
  operator.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path.startsWith('/api/tenant/orders') &&
      (request.method() === 'GET' || path.endsWith('/search'))
    )
      reads.push(path);
  });
  try {
    await f.admin
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.location.id);
    const post = async (path: string, body: unknown) => {
      const response = await api(f.admin, path, body);
      expect(response.status()).toBe(200);
      return response.json();
    };
    const drinks = (await post('/catalog/categories', { name: 'Băuturi operator' })).category;
    const snacks = (await post('/catalog/categories', { name: 'Gustări operator' })).category;
    const coffee = (
      await post('/catalog/products', {
        locationId: f.location.id,
        categoryId: drinks.id,
        name: 'Cafea operator',
        sku: 'OP-COFFEE',
        price: '10',
      })
    ).product;
    const snack = (
      await post('/catalog/products', {
        locationId: f.location.id,
        categoryId: snacks.id,
        name: 'Gustare operator',
        sku: 'OP-SNACK',
        price: '5',
      })
    ).product;
    const foreign = (
      await post('/catalog/products', {
        locationId: f.otherLocation.id,
        categoryId: drinks.id,
        name: 'Produs numai Nord',
        sku: 'OP-NORTH',
        price: '22',
      })
    ).product;
    if (readOrders) {
      for (let index = 0; index < 24; index++) {
        await post('/catalog/products', {
          locationId: f.location.id,
          categoryId: drinks.id,
          name: `Produs catalog ${String(index).padStart(2, '0')}`,
          sku: `OP-GRID-${index}`,
          price: '1',
        });
      }
    }
    const group = (
      await post('/catalog/modifier-groups', {
        name: 'Lapte operator',
        minSelections: 1,
        maxSelections: 1,
        sortOrder: 1,
      })
    ).modifierGroup;
    const option = (
      await post(`/catalog/modifier-groups/${group.id}/options`, {
        name: 'Ovăz operator',
        extraPrice: '1.0050',
        sortOrder: 1,
      })
    ).modifierOption;
    await post(`/catalog/products/${coffee.id}/modifier-groups`, { modifierGroupId: group.id });
    await post(`/inventory/modifier-recipes/${coffee.id}/${option.id}`, {
      expectedVersion: 0,
      requestKey: randomUUID(),
      reason: 'Opțiune sintetică fără efect asupra stocului',
      components: [],
    });
    const role = (
      await post('/roles', {
        name: readOrders ? 'Operator cu istoric' : 'Operator doar creare',
        permissions: ['orders.create', ...(readOrders ? ['orders.read'] : [])].map(
          (permission) => ({ permission }),
        ),
      })
    ).role;
    const actor = await post('/staff', {
      login: 'operator-pin',
      displayName: 'Operator sintetic',
      authenticationMethod: 'PIN',
      locationIds: [f.location.id, f.otherLocation.id],
      assignments: [f.location.id, f.otherLocation.id].map((locationId) => ({
        roleVersionId: role.versions[0].id,
        scopeType: 'LOCATION',
        locationId,
      })),
    });
    await operator.goto(`${tenantOrigin}/c/${f.slug}/login`);
    await operator.getByLabel('Cod PIN', { exact: true }).fill(actor.pin);
    await submit(
      operator,
      '/api/tenant/auth/pin',
      operator.getByRole('button', { name: 'Intră cu cod PIN', exact: true }),
    );
    await expect(operator.getByRole('heading', { name: /^Bun venit,/ })).toBeVisible();
    await operator
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.location.id);
    await navigateSection(operator, 'Operator');
    return {
      ...f,
      operator,
      reads,
      coffee,
      snack,
      foreign,
      drinks,
      snacks,
      dispose: async () => {
        await context.close();
        await f.dispose();
      },
    };
  } catch (error) {
    await context.close();
    await f.dispose();
    throw error;
  }
}
