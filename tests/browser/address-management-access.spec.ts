import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { addressManagementFixture } from './address-management-setup';
import { api } from './support/browser-helpers';

test('adresar CRM acces: citire fără mutații și eliminarea datelor după revocare', async ({
  browser,
}) => {
  const f = await addressManagementFixture(browser, false);
  const page = f.page;
  try {
    const book = page.getByRole('region', { name: 'Adresele clientului', exact: true });
    const card = book.getByRole('article', { name: 'Adresă acces', exact: true });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button')).toHaveCount(0);
    await expect(book.getByRole('button', { name: 'Adresă nouă', exact: true })).toHaveCount(0);
    await page.route(
      '**/address-book?*',
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
    const rejected = page.waitForResponse((response) => response.url().includes('/address-book?'));
    await book.getByRole('button', { name: 'Actualizează adresarul', exact: true }).click();
    expect([401, 403]).toContain((await rejected).status());
    await expect(page.getByText('Strada acces 131', { exact: true })).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});

test('adresar CRM acces: conflict de preferință și revocarea gestionării la recuperare', async ({
  browser,
}) => {
  const f = await addressManagementFixture(browser, true);
  const page = f.page;
  try {
    const detail = page.getByRole('dialog', { name: 'Profil client', exact: true });
    const book = detail.getByRole('region', { name: 'Adresele clientului', exact: true });
    const card = book.getByRole('article', { name: 'Adresă acces', exact: true });
    await expect(
      card.getByRole('button', { name: 'Alege ca adresă implicită', exact: true }),
    ).toBeEnabled();
    await expect(
      detail.getByRole('button', { name: 'Salvează profilul', exact: true }),
    ).toHaveCount(0);
    const path = `/api/tenant/customers/${f.customer.id}/addresses/${f.address.id}/commands`;
    expect(
      (
        await api(f.admin, `/customers/${f.customer.id}/addresses/${f.address.id}/commands`, {
          locationId: f.location.id,
          requestKey: randomUUID(),
          action: 'SET_DEFAULT',
          version: 1,
          preferenceVersion: 1,
        })
      ).status(),
    ).toBe(200);
    const conflict = page.waitForResponse((response) => response.url().endsWith(path));
    await card.getByRole('button', { name: 'Alege ca adresă implicită', exact: true }).click();
    expect((await conflict).status()).toBe(409);
    await expect(
      book.getByText('Actualizează adresarul înainte de o operație nouă.', { exact: true }),
    ).toBeVisible();
    await book.getByRole('button', { name: 'Actualizează adresarul', exact: true }).click();
    await expect(card.getByText('Adresă implicită', { exact: true })).toBeVisible();
    await page.route(
      `**${path}`,
      async (route) => {
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('failed');
      },
      { times: 1 },
    );
    await card.getByRole('button', { name: 'Elimină preferința implicită', exact: true }).click();
    const resolve = book.getByRole('button', {
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
              permission: 'customers.addresses.manage',
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
    const state = await (
      await api(f.admin, `/customers/${f.customer.id}/address-book?locationId=${f.location.id}`)
    ).json();
    expect(state.preference).toMatchObject({ version: 3, defaultAddressId: null });
  } finally {
    await f.dispose();
  }
});
