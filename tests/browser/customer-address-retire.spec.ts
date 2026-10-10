import { test, expect } from '@playwright/test';
import {
  customerAddressFixture,
  selectAddressCustomer,
  reloadAddressDraft,
  addressPointers,
  noAddressPersistence,
} from './customer-address-setup';
import { api, submit } from './support/browser-helpers';

test('adrese: după pierdere înainte de commit și reload retragerea definitivă blochează originalul întârziat fără PII persistat', async ({
  browser,
}) => {
  const f = await customerAddressFixture(browser);
  const { operator, draft } = f;
  try {
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('DELIVERY');
    await selectAddressCustomer(f);
    const address = 'Adresă înainte de commit 73';
    await draft.getByLabel('Adresa completă', { exact: true }).fill(address);
    let original = '';
    let before: Awaited<ReturnType<typeof addressPointers>> = [];
    await operator.route(`**/api/tenant${f.path}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      original = route.request().postData()!;
      expect(route.request().headers()['idempotency-key']).toBe(JSON.parse(original).requestKey);
      before = await addressPointers(operator);
      await route.abort('failed');
    });
    await draft.getByRole('button', { name: 'Salvează adresa în agendă', exact: true }).click();
    const recovery = draft.getByRole('region', {
      name: 'Recuperarea operațiunii adresei',
      exact: true,
    });
    await expect(
      recovery.getByRole('button', { name: 'Verifică rezultatul adresei', exact: true }),
    ).toBeVisible();
    await expect.poll(() => before.length).toBe(1);
    await expect(
      recovery.getByRole('button', { name: 'Verifică rezultatul adresei', exact: true }),
    ).toBeEnabled();
    expect(Object.keys(before[0]!.value).sort()).toEqual([
      'actorUserId',
      'customerId',
      'locationId',
      'operation',
      'organizationId',
      'requestKey',
    ]);
    expect(before[0]!.value).toMatchObject({
      customerId: f.customer.id,
      operation: 'CREATE',
      requestKey: JSON.parse(original).requestKey,
    });
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toBeDisabled();
    await noAddressPersistence(f, [address, f.customer.phone, f.customer.name]);
    await operator.unroute(`**/api/tenant${f.path}`);
    await reloadAddressDraft(f);
    await expect(
      draft.getByRole('button', { name: 'Selectează clientul', exact: true }),
    ).toHaveCount(0);
    await expect(
      recovery.getByRole('button', { name: 'Reîncearcă operațiunea adresei', exact: true }),
    ).toHaveCount(0);
    const resolved = await submit(
      operator,
      `/api/tenant${f.path}/creation-resolution`,
      recovery.getByRole('button', { name: 'Verifică rezultatul adresei', exact: true }),
    );
    expect(resolved).toMatchObject({
      status: 'RETIRED',
      customerId: f.customer.id,
      requestKey: JSON.parse(original).requestKey,
    });
    expect(await addressPointers(operator)).toEqual([]);
    await expect(draft.getByLabel('Tip de servire', { exact: true })).toBeEnabled();
    const delayed = await api(operator, f.path, JSON.parse(original));
    expect(delayed.status()).toBe(409);
    expect((await delayed.json()).code).toBe('CUSTOMER_ADDRESS_CREATION_RETIRED');
    expect(
      (await (await api(f.admin, `${f.path}?locationId=${f.location.id}`)).json()).addresses,
    ).toEqual([]);
    await noAddressPersistence(f, [address, f.customer.phone, f.customer.name]);
  } finally {
    await f.dispose();
  }
});
