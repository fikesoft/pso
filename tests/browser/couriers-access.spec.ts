import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, localOnly, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

test('curieri acces: PIN propriu fără roster și eliminare după revocare', async ({ browser }) => {
  const f = await operationsFixture(browser),
    context = await browser.newContext();
  await localOnly(context);
  const page = await context.newPage();
  try {
    const roleResponse = await api(f.admin, '/roles', {
      name: 'Curier PIN',
      permissions: ['orders.read', 'delivery.update', 'couriers.availability'].map(
        (permission) => ({ permission }),
      ),
    });
    expect(roleResponse.status()).toBe(200);
    const { role } = await roleResponse.json();
    const actorResponse = await api(f.admin, '/staff', {
      login: 'courier-pin',
      displayName: 'Curier PIN propriu',
      authenticationMethod: 'PIN',
      locationIds: [f.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.location.id },
      ],
    });
    expect(actorResponse.status()).toBe(200);
    const actor = await actorResponse.json();
    expect(
      (
        await api(f.admin, `/couriers/${randomUUID()}/commands`, {
          action: 'CREATE',
          locationId: f.location.id,
          requestKey: randomUUID(),
          userId: actor.user.id,
          profile: { vehicle: 'BICYCLE', capacity: 2 },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`${tenantOrigin}/c/${f.slug}/login`);
    await page.getByLabel('Cod PIN', { exact: true }).fill(actor.pin);
    await submit(
      page,
      '/api/tenant/auth/pin',
      page.getByRole('button', { name: 'Intră cu cod PIN', exact: true }),
    );
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Curieri');
    await expect(
      page.getByRole('heading', { name: 'Curier PIN propriu', exact: true }),
    ).toBeVisible();
    for (const name of [
      'Înregistrează curier',
      'Editează profilul curierului',
      'Arhivează curierul',
    ])
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Starea profilurilor', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Schimbă disponibilitatea', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Disponibilitate', { exact: true }).selectOption('AVAILABLE');
    await dialog.getByRole('button', { name: 'Salvează curierul', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText('Disponibilitate: Disponibil · Livrări active: 0', { exact: true }),
    ).toBeVisible();
    await page.route(
      '**/api/tenant/couriers/me?**',
      async (route) => {
        expect(
          (
            await api(f.admin, `/staff/${actor.user.id}/overrides`, {
              permission: 'couriers.availability',
              effect: 'DENY',
              scopeType: 'LOCATION',
              locationId: f.location.id,
            })
          ).status(),
        ).toBe(200);
        await route.continue();
      },
      { times: 1 },
    );
    const rejected = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/tenant/couriers/me',
    );
    await page.getByRole('button', { name: 'Reîncarcă curierii', exact: true }).click();
    expect([401, 403]).toContain((await rejected).status());
    await expect(
      page.getByRole('heading', { name: 'Curier PIN propriu', exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
    await f.dispose();
  }
});
