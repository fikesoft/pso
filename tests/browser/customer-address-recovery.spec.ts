import { test, expect } from '@playwright/test';
import {
  customerAddressFixture,
  selectAddressCustomer,
  reloadAddressDraft,
  addressPointers,
  noAddressPersistence,
} from './customer-address-setup';
import { api, submit } from './support/browser-helpers';

test('adrese: reload rezolvă crearea comisă fără selecție automată și reia exact arhivarea necunoscută din pointer opac', async ({
  browser,
}) => {
  const f = await customerAddressFixture(browser);
  const { operator, draft } = f;
  try {
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('DELIVERY');
    await selectAddressCustomer(f);
    const address = 'Destinație după commit 92';
    await draft.getByLabel('Adresa completă', { exact: true }).fill(address);
    let original = '';
    let createdId = '';
    await operator.route(`**/api/tenant${f.path}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      original = route.request().postData()!;
      expect((await addressPointers(operator))[0]!.value.requestKey).toBe(
        JSON.parse(original).requestKey,
      );
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      createdId = (await result.json()).address.id;
      await route.abort('failed');
    });
    await draft.getByRole('button', { name: 'Salvează adresa în agendă', exact: true }).click();
    const recovery = draft.getByRole('region', {
      name: 'Recuperarea operațiunii adresei',
      exact: true,
    });
    const resolve = recovery.getByRole('button', {
      name: 'Verifică rezultatul adresei',
      exact: true,
    });
    await expect(resolve).toBeEnabled();
    expect(createdId).toBeTruthy();
    await noAddressPersistence(f, [address, f.customer.name, f.customer.phone]);
    await operator.unroute(`**/api/tenant${f.path}`);
    await operator.route(`**/api/tenant${f.path}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      expect(route.request().postData()).toBe(original);
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Acces interzis', code: 'REQUEST_REJECTED' }),
      });
    });
    const rejected = operator.waitForResponse(
      (response) => response.url().endsWith(f.path) && response.status() === 403,
    );
    await recovery
      .getByRole('button', { name: 'Reîncearcă operațiunea adresei', exact: true })
      .click();
    await rejected;
    await expect(resolve).toBeEnabled();
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toBeDisabled();
    await expect(
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    ).toBeDisabled();
    await expect(
      draft.getByRole('button', { name: 'Renunță la modificări', exact: true }),
    ).toBeDisabled();
    expect((await addressPointers(operator))[0]!.value.requestKey).toBe(
      JSON.parse(original).requestKey,
    );
    await operator.unroute(`**/api/tenant${f.path}`);
    await reloadAddressDraft(f);
    const resolutionPath = `/api/tenant${f.path}/creation-resolution`;
    let resolveBody = '';
    await operator.route(`**${resolutionPath}`, async (route) => {
      resolveBody = route.request().postData()!;
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      expect((await result.json()).address.id).toBe(createdId);
      await route.abort('failed');
    });
    await resolve.click();
    await expect(resolve).toBeEnabled();
    await expect(draft.getByLabel('Tip de servire', { exact: true })).toBeDisabled();
    expect(await addressPointers(operator)).toHaveLength(1);
    await operator.unroute(`**${resolutionPath}`);
    const requested = operator.waitForRequest((request) => request.url().endsWith(resolutionPath));
    const resolved = await submit(operator, resolutionPath, resolve);
    expect((await requested).postData()).toBe(resolveBody);
    expect(resolved).toMatchObject({
      status: 'CREATED',
      address: { id: createdId, status: 'ACTIVE' },
    });
    expect(await addressPointers(operator)).toEqual([]);
    await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue('');
    await expect(draft.getByLabel('Tip de servire', { exact: true })).toHaveValue('DINE_IN');
    await expect(
      recovery.getByRole('button', { name: 'Selectează adresa', exact: true }),
    ).toBeDisabled();
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('DELIVERY');
    await selectAddressCustomer(f);
    await recovery.getByRole('button', { name: 'Selectează adresa', exact: true }).click();
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toHaveValue(address);
    const archivePath = `/api/tenant${f.path}/${createdId}/archive`;
    let archiveBody = '';
    await operator.route(`**${archivePath}`, async (route) => {
      archiveBody = route.request().postData()!;
      expect(route.request().headers()['idempotency-key']).toBe(JSON.parse(archiveBody).requestKey);
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      expect((await result.json()).address.status).toBe('ARCHIVED');
      await route.abort('failed');
    });
    await draft
      .getByRole('region', { name: 'Adresele clientului', exact: true })
      .getByRole('button', { name: 'Arhivează adresa', exact: true })
      .click();
    const retry = recovery.getByRole('button', {
      name: 'Reîncearcă operațiunea adresei',
      exact: true,
    });
    await expect(retry).toBeEnabled();
    const pointers = await addressPointers(operator);
    expect(Object.keys(pointers[0]!.value).sort()).toEqual([
      'actorUserId',
      'addressId',
      'customerId',
      'locationId',
      'operation',
      'organizationId',
      'requestKey',
      'version',
    ]);
    expect(pointers[0]!.value).toMatchObject({
      operation: 'ARCHIVE',
      addressId: createdId,
      customerId: f.customer.id,
      version: 1,
    });
    await operator.unroute(`**${archivePath}`);
    await reloadAddressDraft(f);
    await expect(retry).toBeEnabled();
    await expect(resolve).toHaveCount(0);
    const request = operator.waitForRequest((value) => value.url().endsWith(archivePath));
    const archived = await submit(operator, archivePath, retry);
    expect((await request).postData()).toBe(archiveBody);
    expect(archived.address).toMatchObject({ id: createdId, status: 'ARCHIVED', version: 2 });
    expect(await addressPointers(operator)).toEqual([]);
    await expect(
      recovery.getByRole('button', { name: 'Selectează adresa', exact: true }),
    ).toHaveCount(0);
    await expect(
      recovery
        .getByRole('article')
        .getByText('Adresa este arhivată și nu poate fi selectată pentru o comandă nouă.', {
          exact: true,
        }),
    ).toBeVisible();
    expect(
      (await (await api(f.admin, `${f.path}?locationId=${f.location.id}`)).json()).addresses,
    ).toEqual([]);
    await noAddressPersistence(f, [address, f.customer.name, f.customer.phone]);
  } finally {
    await f.dispose();
  }
});
