import { test, expect } from '@playwright/test';
import { customerLookupFixture, lookupClient } from './customer-lookup-setup';
import { api, navigateSection, submit } from './support/browser-helpers';

test('clienți: contactul manual nu înregistrează profil, iar înregistrarea și selectarea rămân acțiuni explicite în formular', async ({
  browser,
}) => {
  const f = await customerLookupFixture(browser);
  const { operator, admin, location } = f;
  try {
    const phone = '060313233';
    let registrations = 0;
    operator.on('request', (request) => {
      if (request.url().endsWith('/api/tenant/customers') && request.method() === 'POST')
        registrations++;
    });
    const draft = operator.getByRole('region', { name: 'Comanda curentă', exact: true });
    const catalog = operator.getByRole('region', { name: 'Catalog operator', exact: true });
    await catalog.getByRole('button', { name: /Produs clienți/ }).click();
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await draft.getByLabel('Numele clientului', { exact: true }).fill('Contact manual');
    await draft.getByLabel('Telefonul clientului', { exact: true }).fill(phone);
    const manual = await submit(
      operator,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(manual.order.customerRef).toBeNull();
    expect(registrations).toBe(0);
    expect(
      (await (await api(admin, '/customers/lookup', { locationId: location.id, phone })).json())
        .customer,
    ).toBeNull();
    await operator.keyboard.press('Escape');
    await navigateSection(operator, 'Comenzi');
    await operator.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const editor = operator.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await editor.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await editor.getByLabel('Numele clientului', { exact: true }).fill('Profil companie');
    await editor.getByLabel('Telefonul clientului', { exact: true }).fill(phone);
    await editor.getByRole('button', { name: /Produs clienți/ }).click();
    expect((await lookupClient(operator, editor)).customer).toBeNull();
    const registered = await submit(
      operator,
      '/api/tenant/customers',
      editor.getByRole('button', { name: 'Înregistrează profilul de client', exact: true }),
    );
    expect(registrations).toBe(1);
    await expect(editor.getByLabel('Numele clientului', { exact: true })).toBeEnabled();
    await expect(
      editor.getByRole('button', { name: 'Selectează clientul', exact: true }),
    ).toBeVisible();
    await editor.getByRole('button', { name: 'Selectează clientul', exact: true }).click();
    await expect(editor.getByLabel('Numele clientului', { exact: true })).toBeDisabled();
    const linked = await submit(
      operator,
      '/api/tenant/orders',
      editor.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(linked.order.customerRef).toEqual({ id: registered.customer.id, version: 1 });
    const details = operator.getByRole('dialog', { name: 'Comanda #2', exact: true });
    await details.getByRole('button', { name: 'Editează ciorna', exact: true }).click();
    const edit = operator.getByRole('dialog', { name: 'Editează ciorna #2', exact: true });
    await edit.getByRole('button', { name: 'Folosește contact manual', exact: true }).click();
    await expect(edit.getByLabel('Numele clientului', { exact: true })).toHaveValue(
      'Profil companie',
    );
    await edit.getByLabel('Numele clientului', { exact: true }).fill('Contact editat manual');
    expect((await lookupClient(operator, edit)).customer.id).toBe(registered.customer.id);
    await expect(edit.getByLabel('Numele clientului', { exact: true })).toHaveValue(
      'Contact editat manual',
    );
    const changed = operator.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tenant/orders/${linked.order.id}`) &&
        response.request().method() === 'PATCH',
    );
    await edit.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    const response = await changed;
    expect(response.status()).toBe(200);
    expect((await response.json()).order).toMatchObject({
      customerRef: null,
      customer: { name: 'Contact editat manual', phone },
    });
    expect(
      (await (await api(admin, `/orders/${manual.order.id}`)).json()).order.customer.name,
    ).toBe('Contact manual');
    expect(
      (await (await api(admin, '/customers/lookup', { locationId: location.id, phone })).json())
        .customer.name,
    ).toBe('Profil companie');
    expect(registrations).toBe(1);
  } finally {
    await f.dispose();
  }
});
