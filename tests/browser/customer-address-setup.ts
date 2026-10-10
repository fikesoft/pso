import { expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, isolatedPage, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';
import { lookupClient } from './customer-lookup-setup';

export async function customerAddressFixture(browser: Browser, canManage = true) {
  const f = await operationsFixture(browser);
  const contexts: BrowserContext[] = [];
  try {
    const post = async (path: string, body: unknown) => {
      const response = await api(f.admin, path, body);
      expect(response.status()).toBe(200);
      return response.json();
    };
    const product = (
      await post('/catalog/products', {
        locationId: f.location.id,
        name: 'Produs adrese',
        sku: 'ADDRESS-PRODUCT',
        price: '10',
      })
    ).product;
    const secondLocation = (await post('/locations', { name: 'Adrese Nord', code: 'ADR-N' }))
      .location;
    const localRole = (
      await post('/roles', {
        name: 'Comenzi adrese',
        permissions: [{ permission: 'orders.read' }, { permission: 'orders.create' }],
      })
    ).role;
    const crmRole = (
      await post('/roles', {
        name: 'Adresar companie',
        permissions: [
          { permission: 'customers.read' },
          ...(canManage ? [{ permission: 'customers.addresses.manage' }] : []),
        ],
      })
    ).role;
    const account = await post('/staff', {
      login: 'address-pin',
      displayName: 'Operator adrese',
      authenticationMethod: 'PIN',
      locationIds: [f.location.id, secondLocation.id],
      assignments: [
        {
          roleVersionId: localRole.versions[0].id,
          scopeType: 'LOCATION',
          locationId: f.location.id,
        },
        {
          roleVersionId: localRole.versions[0].id,
          scopeType: 'LOCATION',
          locationId: secondLocation.id,
        },
        { roleVersionId: crmRole.versions[0].id, scopeType: 'ORGANIZATION' },
      ],
    });
    const customer = (
      await post('/customers', {
        locationId: f.location.id,
        requestKey: crypto.randomUUID(),
        name: 'Client adrese privat',
        phone: '060515253',
      })
    ).customer;
    const otherCustomer = (
      await post('/customers', {
        locationId: f.location.id,
        requestKey: crypto.randomUUID(),
        name: 'Alt client adrese',
        phone: '060616263',
      })
    ).customer;
    const operator = await isolatedPage(browser, contexts);
    const urls: string[] = [];
    operator.on('request', (request) => urls.push(decodeURIComponent(request.url())));
    await operator.goto(`${tenantOrigin}/c/${f.slug}/login`);
    await operator.getByLabel('Cod PIN', { exact: true }).fill(account.pin);
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
    const draft = operator.getByRole('region', { name: 'Comanda curentă', exact: true });
    const path = `/customers/${customer.id}/addresses`;
    return {
      ...f,
      operator,
      draft,
      customer,
      otherCustomer,
      product,
      secondLocation,
      path,
      urls,
      post,
      dispose: async () => {
        for (const context of contexts) await context.close();
        await f.dispose();
      },
    };
  } catch (error) {
    for (const context of contexts) await context.close();
    await f.dispose();
    throw error;
  }
}

export async function selectAddressCustomer(
  f: Awaited<ReturnType<typeof customerAddressFixture>>,
  other = false,
) {
  const customer = other ? f.otherCustomer : f.customer;
  await f.draft.getByLabel('Telefonul clientului', { exact: true }).fill(customer.phone);
  expect((await lookupClient(f.operator, f.draft)).customer.id).toBe(customer.id);
  await f.draft.getByRole('button', { name: 'Selectează clientul', exact: true }).click();
}

export async function reloadAddressDraft(f: Awaited<ReturnType<typeof customerAddressFixture>>) {
  await f.operator.reload();
  await f.operator
    .getByRole('combobox', { name: 'Context', exact: true })
    .selectOption(f.location.id);
  await navigateSection(f.operator, 'Operator');
  await expect(f.draft.getByLabel('Numele clientului', { exact: true })).toHaveValue('');
  await expect(f.draft.getByLabel('Tip de servire', { exact: true })).toHaveValue('DINE_IN');
}

export async function addressPointers(page: Page) {
  return page.evaluate(() =>
    Object.entries(sessionStorage)
      .filter(([key]) => key.includes('address'))
      .map(([key, value]) => ({ key, value: JSON.parse(value) as Record<string, unknown> })),
  );
}

export async function noAddressPersistence(
  f: Awaited<ReturnType<typeof customerAddressFixture>>,
  values: string[],
) {
  const storage = await f.operator.evaluate(() =>
    JSON.stringify({
      local: Object.entries(localStorage),
      session: Object.entries(sessionStorage),
    }),
  );
  for (const text of [storage, f.urls.join('\n'), f.operator.url()])
    for (const value of values) expect(text).not.toContain(value);
}
