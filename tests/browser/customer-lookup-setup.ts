import { expect } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, localOnly, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

export async function customerLookupFixture(browser: Browser) {
  const f = await operationsFixture(browser);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await localOnly(context);
  const operator = await context.newPage();
  const urls: string[] = [];
  operator.on('request', (request) => urls.push(decodeURIComponent(request.url())));
  try {
    const post = async (path: string, body: unknown) => {
      const response = await api(f.admin, path, body);
      expect(response.status()).toBe(200);
      return response.json();
    };
    const product = (
      await post('/catalog/products', {
        locationId: f.location.id,
        name: 'Produs clienți',
        sku: 'CRM-PRODUCT',
        price: '10',
      })
    ).product;
    const operations = (
      await post('/roles', {
        name: 'Operațiuni locale',
        permissions: [{ permission: 'orders.create' }, { permission: 'orders.read' }],
      })
    ).role;
    const customers = (
      await post('/roles', {
        name: 'Clienți companie',
        permissions: [{ permission: 'customers.read' }, { permission: 'customers.create' }],
      })
    ).role;
    const created = await post('/staff', {
      login: 'customer-pin',
      displayName: 'Operator clienți',
      authenticationMethod: 'PIN',
      locationIds: [f.location.id],
      assignments: [
        {
          roleVersionId: operations.versions[0].id,
          scopeType: 'LOCATION',
          locationId: f.location.id,
        },
        { roleVersionId: customers.versions[0].id, scopeType: 'ORGANIZATION' },
      ],
    });
    await operator.goto(`${tenantOrigin}/c/${f.slug}/login`);
    await operator.getByLabel('Cod PIN', { exact: true }).fill(created.pin);
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
      product,
      urls,
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

export async function lookupClient(page: Page, editor: Locator) {
  return submit(
    page,
    '/api/tenant/customers/lookup',
    editor.getByRole('button', { name: 'Caută clientul după telefon', exact: true }),
  );
}

export async function assertNoCustomerPersistence(
  page: Page,
  urls: string[],
  name: string,
  phone: string,
) {
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: Object.entries(localStorage),
      session: Object.entries(sessionStorage),
    }),
  );
  for (const value of [urls.join('\n'), page.url(), storage]) {
    expect(value).not.toContain(name);
    expect(value).not.toContain(phone);
  }
}
