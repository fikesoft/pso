import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, localOnly, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';
export async function addressManagementFixture(browser: Browser, manage: boolean) {
  const f = await operationsFixture(browser);
  const context = await browser.newContext();
  await localOnly(context);
  const page = await context.newPage();
  try {
    const roleResponse = await api(f.admin, '/roles', {
      name: 'Adresar CRM',
      permissions: ['customers.read', ...(manage ? ['customers.addresses.manage'] : [])].map(
        (permission) => ({ permission }),
      ),
    });
    expect(roleResponse.status()).toBe(200);
    const { role } = await roleResponse.json();
    const response = await api(f.admin, '/staff', {
      login: 'address-crm',
      displayName: 'Operator adresar',
      authenticationMethod: 'PIN',
      locationIds: [f.location.id],
      assignments: [{ roleVersionId: role.versions[0].id, scopeType: 'ORGANIZATION' }],
    });
    expect(response.status()).toBe(200);
    const staff = await response.json();
    const customer = (
      await (
        await api(f.admin, '/customers', {
          locationId: f.location.id,
          requestKey: randomUUID(),
          name: 'Acces adresar',
          phone: '060310133',
        })
      ).json()
    ).customer;
    const address = (
      await (
        await api(f.admin, `/customers/${customer.id}/addresses`, {
          locationId: f.location.id,
          requestKey: randomUUID(),
          label: 'Adresă acces',
          address: 'Strada acces 131',
        })
      ).json()
    ).address;
    await page.goto(`${tenantOrigin}/c/${f.slug}/login`);
    await page.getByLabel('Cod PIN', { exact: true }).fill(staff.pin);
    await submit(
      page,
      '/api/tenant/auth/pin',
      page.getByRole('button', { name: 'Intră cu cod PIN', exact: true }),
    );
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Clienți');
    await page.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    return {
      ...f,
      page,
      customer,
      address,
      staff,
      dispose: async () => {
        await context.close();
        await f.dispose();
      },
    };
  } catch (failure) {
    await context.close();
    await f.dispose();
    throw failure;
  }
}
