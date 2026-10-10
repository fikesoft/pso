import { test, expect } from '@playwright/test';
import {
  customerLookupFixture,
  lookupClient,
  assertNoCustomerPersistence,
} from './customer-lookup-setup';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('clienți: răspuns pierdut înainte și după commit păstrează cererea exactă, iar reload cere căutare și selectare fără PII persistat', async ({
  browser,
}, info) => {
  const f = await customerLookupFixture(browser);
  const { operator, admin, location } = f;
  try {
    const name = 'Client retry privat';
    const phone = '060414243';
    const draft = operator.getByRole('region', { name: 'Comanda curentă', exact: true });
    await operator
      .getByRole('region', { name: 'Catalog operator', exact: true })
      .getByRole('button', { name: /Produs clienți/ })
      .click();
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await draft.getByLabel('Numele clientului', { exact: true }).fill(name);
    await draft.getByLabel('Telefonul clientului', { exact: true }).fill(phone);
    expect((await lookupClient(operator, draft)).customer).toBeNull();
    const payloads: string[] = [];
    let committedId = '';
    let committed!: () => void;
    const completed = new Promise<void>((resolve) => {
      committed = resolve;
    });
    await operator.route('**/api/tenant/customers', async (route) => {
      payloads.push(route.request().postData()!);
      expect(route.request().headers()['idempotency-key']).toBe(
        JSON.parse(payloads[0]!).requestKey,
      );
      if (payloads.length === 1) return route.abort('failed');
      expect(payloads.at(-1)).toBe(payloads[0]);
      if (payloads.length === 3)
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Acces refuzat', code: 'REQUEST_REJECTED' }),
        });
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committedId = (await response.json()).customer.id;
      await route.abort('failed');
      committed();
    });
    await draft
      .getByRole('button', { name: 'Înregistrează profilul de client', exact: true })
      .click();
    const crm = draft.getByRole('region', { name: 'Clientul companiei', exact: true });
    const retry = crm.getByRole('button', {
      name: 'Reîncearcă înregistrarea clientului',
      exact: true,
    });
    await expect(crm.getByText(/Rezultatul înregistrării este necunoscut/)).toBeVisible();
    expect(
      (await (await api(admin, '/customers/lookup', { locationId: location.id, phone })).json())
        .customer,
    ).toBeNull();
    await expect(draft.getByLabel('Telefonul clientului', { exact: true })).toBeDisabled();
    await expect(draft.getByLabel('Cantitate', { exact: true })).toBeDisabled();
    await expect(
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    ).toBeDisabled();
    await expect(
      draft.getByRole('button', { name: 'Renunță la modificări', exact: true }),
    ).toBeDisabled();
    await assertNoCustomerPersistence(operator, f.urls, name, phone);
    await retry.click();
    await completed;
    await expect(retry).toBeEnabled();
    expect(
      (await (await api(admin, '/customers/lookup', { locationId: location.id, phone })).json())
        .customer.id,
    ).toBe(committedId);
    const rejected = operator.waitForResponse(
      (response) => response.url().endsWith('/api/tenant/customers') && response.status() === 403,
    );
    await retry.click();
    await rejected;
    await expect(retry).toBeEnabled();
    await expect(draft.getByLabel('Telefonul clientului', { exact: true })).toBeDisabled();
    await expect(draft.getByLabel('Cantitate', { exact: true })).toBeDisabled();
    await expect(
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    ).toBeDisabled();
    await expect(
      draft.getByRole('button', { name: 'Renunță la modificări', exact: true }),
    ).toBeDisabled();
    await operator.unroute('**/api/tenant/customers');
    const repeated = operator.waitForRequest(
      (request) => request.url().endsWith('/api/tenant/customers') && request.method() === 'POST',
    );
    const replay = await submit(operator, '/api/tenant/customers', retry);
    expect((await repeated).postData()).toBe(payloads[0]);
    expect(replay.customer.id).toBe(committedId);
    await expect(draft.getByLabel('Numele clientului', { exact: true })).toBeEnabled();
    await expect(
      crm.getByRole('button', { name: 'Selectează clientul', exact: true }),
    ).toBeVisible();
    await assertNoCustomerPersistence(operator, f.urls, name, phone);
    await operator.reload();
    await operator
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(location.id);
    await navigateSection(operator, 'Operator');
    await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue('');
    await expect(draft.getByLabel('Telefonul clientului', { exact: true })).toHaveValue('');
    await expect(crm.getByRole('button', { name: 'Selectează clientul', exact: true })).toHaveCount(
      0,
    );
    await draft.getByLabel('Telefonul clientului', { exact: true }).fill(phone);
    expect((await lookupClient(operator, draft)).customer.id).toBe(committedId);
    await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue('');
    await crm.getByRole('button', { name: 'Selectează clientul', exact: true }).click();
    await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue(name);
    await draft.getByLabel('Numele clientului', { exact: true }).scrollIntoViewIfNeeded();
    await noOverflow(operator);
    await operator.screenshot({
      path: info.outputPath('customer-lookup-selected-1440.png'),
      fullPage: false,
    });
    await operator.setViewportSize({ width: 360, height: 800 });
    await operator
      .getByRole('group', { name: 'Operator', exact: true })
      .getByRole('button', { name: /^Comanda curentă/ })
      .click();
    await crm.scrollIntoViewIfNeeded();
    await noOverflow(operator);
    await operator.screenshot({
      path: info.outputPath('customer-lookup-selected-360.png'),
      fullPage: false,
    });
    await assertNoCustomerPersistence(operator, f.urls, name, phone);
    const crmWrites: string[] = [];
    operator.on('request', (request) => {
      if (request.url().endsWith('/api/tenant/customers')) crmWrites.push(request.postData()!);
    });
    await crm.getByRole('button', { name: 'Folosește contact manual', exact: true }).click();
    await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue(name);
    await expect(draft.getByLabel('Telefonul clientului', { exact: true })).toHaveValue(phone);
    await operator.setViewportSize({ width: 1440, height: 1000 });
    await operator
      .getByRole('region', { name: 'Catalog operator', exact: true })
      .getByRole('button', { name: /Produs clienți/ })
      .click();
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    const saved = await submit(
      operator,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(saved.order).toMatchObject({ customerRef: null, customer: { name, phone } });
    expect(crmWrites).toEqual([]);
  } finally {
    await f.dispose();
  }
});
