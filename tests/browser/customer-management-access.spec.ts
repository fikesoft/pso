import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, localOnly, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

async function fixture(browser: Browser, permissions: string[]) {
  const f = await operationsFixture(browser);
  const context = await browser.newContext();
  await localOnly(context);
  const page = await context.newPage();
  try {
    const response = await api(f.admin, '/roles', {
      name: 'Acces administrare clienți',
      permissions: permissions.map((permission) => ({ permission })),
    });
    expect(response.status()).toBe(200);
    const { role } = await response.json();
    const createdResponse = await api(f.admin, '/staff', {
      login: 'crm-user',
      displayName: 'Operator CRM',
      authenticationMethod: 'PIN',
      locationIds: [f.location.id],
      assignments: [{ roleVersionId: role.versions[0].id, scopeType: 'ORGANIZATION' }],
    });
    expect(createdResponse.status()).toBe(200);
    const staff = await createdResponse.json();
    const customer = (
      await (
        await api(f.admin, '/customers', {
          locationId: f.location.id,
          name: 'Profil acces CRM',
          phone: '060321458',
          requestKey: randomUUID(),
        })
      ).json()
    ).customer;
    await page.goto(`${tenantOrigin}/c/${f.slug}/login`);
    await page.getByLabel('Cod PIN', { exact: true }).fill(staff.pin);
    await submit(
      page,
      '/api/tenant/auth/pin',
      page.getByRole('button', { name: 'Intră cu cod PIN', exact: true }),
    );
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Clienți');
    return {
      ...f,
      page,
      staff,
      customer,
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

test('administrare clienți acces: citire fără modificări și eliminarea contactelor după revocare', async ({
  browser,
}) => {
  const f = await fixture(browser, ['customers.read']);
  const { page } = f;
  try {
    await expect(page.getByRole('button', { name: 'Client nou', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Profil client', exact: true });
    await expect(detail.getByLabel('Nume', { exact: true })).toBeDisabled();
    await expect(
      detail.getByRole('button', { name: 'Salvează profilul', exact: true }),
    ).toHaveCount(0);
    await expect(
      detail.getByRole('button', { name: 'Arhivează clientul', exact: true }),
    ).toHaveCount(0);
    await detail.getByRole('button', { name: 'Închide profilul', exact: true }).click();
    await page.route(
      '**/api/tenant/customers?*',
      async (route) => {
        expect(
          (
            await api(f.admin, `/staff/${f.staff.user.id}/overrides`, {
              permission: 'customers.read',
              effect: 'DENY',
              scopeType: 'ORGANIZATION',
            })
          ).status(),
        ).toBe(200);
        await route.continue();
      },
      { times: 1 },
    );
    const rejected = page.waitForResponse((response) =>
      response.url().includes('/api/tenant/customers?'),
    );
    await page.getByRole('button', { name: 'Actualizează lista', exact: true }).click();
    expect([401, 403]).toContain((await rejected).status());
    await expect(page.getByText('Profil acces CRM', { exact: true })).toHaveCount(0);
    await expect(page.getByText('060321458', { exact: true })).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});

test('administrare clienți acces: conflict de versiune și revocarea editării la recuperare', async ({
  browser,
}) => {
  const f = await fixture(browser, ['customers.read', 'customers.update']);
  const { page, customer, location } = f;
  try {
    await page.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Profil client', exact: true });
    await expect(detail.getByLabel('Nume', { exact: true })).toBeEnabled();
    await expect(
      detail.getByRole('button', { name: 'Arhivează clientul', exact: true }),
    ).toHaveCount(0);
    const path = `/api/tenant/customers/${customer.id}/commands`;
    expect(
      (
        await api(f.admin, `/customers/${customer.id}/commands`, {
          locationId: location.id,
          version: 1,
          action: 'UPDATE',
          requestKey: randomUUID(),
          profile: { name: 'Actualizat concurent', phone: customer.phone, email: null },
        })
      ).status(),
    ).toBe(200);
    await detail.getByLabel('Nume', { exact: true }).fill('Tentativă veche');
    const conflict = page.waitForResponse((response) => response.url().endsWith(path));
    await detail.getByRole('button', { name: 'Salvează profilul', exact: true }).click();
    expect((await conflict).status()).toBe(409);
    await expect(
      detail.getByText('Actualizează lista înainte de o operație nouă.', { exact: true }),
    ).toBeVisible();
    await detail.getByRole('button', { name: 'Închide profilul', exact: true }).click();
    await page.getByRole('button', { name: 'Actualizează lista', exact: true }).click();
    await page.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    await expect(detail.getByLabel('Nume', { exact: true })).toHaveValue('Actualizat concurent');
    await page.route(
      `**${path}`,
      async (route) => {
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('failed');
      },
      { times: 1 },
    );
    await detail.getByLabel('Nume', { exact: true }).fill('Rezultat fără acces');
    await detail.getByRole('button', { name: 'Salvează profilul', exact: true }).click();
    const resolve = page.getByRole('button', {
      name: 'Verifică rezultatul operației',
      exact: true,
    });
    await expect(resolve).toBeEnabled();
    await page.route(
      `**${path}/resolution`,
      async (route) => {
        expect(
          (
            await api(f.admin, `/staff/${f.staff.user.id}/overrides`, {
              permission: 'customers.update',
              effect: 'DENY',
              scopeType: 'ORGANIZATION',
            })
          ).status(),
        ).toBe(200);
        await route.continue();
      },
      { times: 1 },
    );
    const rejected = page.waitForResponse((response) =>
      response.url().endsWith(`${path}/resolution`),
    );
    await resolve.click();
    expect([401, 403]).toContain((await rejected).status());
    await expect(page.getByText('Operația a fost confirmată.', { exact: true })).toHaveCount(0);
    const current = (
      await (await api(f.admin, `/customers/${customer.id}?locationId=${location.id}`)).json()
    ).customer;
    expect(current).toMatchObject({ version: 3, name: 'Rezultat fără acces' });
  } finally {
    await f.dispose();
  }
});
