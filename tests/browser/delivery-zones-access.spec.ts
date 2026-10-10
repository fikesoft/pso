import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, localOnly, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';
import { deliveryZoneProfile } from '../../packages/db/test/fixtures/delivery-zone.fixture';

test('zone de livrare acces: cititor PIN fără mutații și revocare reală', async ({ browser }) => {
  const f = await operationsFixture(browser),
    context = await browser.newContext();
  await localOnly(context);
  const page = await context.newPage();
  try {
    expect(
      (
        await api(f.admin, `/delivery-zones/${randomUUID()}/commands`, {
          action: 'CREATE',
          locationId: f.location.id,
          requestKey: randomUUID(),
          profile: deliveryZoneProfile(),
        })
      ).status(),
    ).toBe(200);
    const roleResponse = await api(f.admin, '/roles', {
      name: 'Cititor zone PIN',
      permissions: [{ permission: 'delivery.zones.read' }],
    });
    expect(roleResponse.status()).toBe(200);
    const { role } = await roleResponse.json();
    const actorResponse = await api(f.admin, '/staff', {
      login: 'zones-pin',
      displayName: 'Cititor zone PIN',
      authenticationMethod: 'PIN',
      locationIds: [f.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.location.id },
      ],
    });
    expect(actorResponse.status()).toBe(200);
    const actor = await actorResponse.json();
    await page.goto(`${tenantOrigin}/c/${f.slug}/login`);
    await page.getByLabel('Cod PIN', { exact: true }).fill(actor.pin);
    await submit(
      page,
      '/api/tenant/auth/pin',
      page.getByRole('button', { name: 'Intră cu cod PIN', exact: true }),
    );
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Zone de livrare');
    await expect(page.getByRole('heading', { name: 'Centru sintetic', exact: true })).toBeVisible();
    for (const name of ['Zonă nouă', 'Editează zona', 'Arhivează zona'])
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    await page.route(
      '**/api/tenant/delivery-zones?**',
      async (route) => {
        expect(
          (
            await api(f.admin, `/staff/${actor.user.id}/overrides`, {
              permission: 'delivery.zones.read',
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
      (response) => new URL(response.url()).pathname === '/api/tenant/delivery-zones',
    );
    await page.getByRole('button', { name: 'Reîncarcă zonele', exact: true }).click();
    expect([401, 403]).toContain((await rejected).status());
    await expect(page.getByRole('heading', { name: 'Centru sintetic', exact: true })).toHaveCount(
      0,
    );
  } finally {
    await context.close();
    await f.dispose();
  }
});

test('zone de livrare listă: paginare și eliminarea datelor după indisponibilitate', async ({
  browser,
}) => {
  const f = await operationsFixture(browser),
    page = f.admin;
  try {
    for (let index = 0; index < 31; index++)
      expect(
        (
          await api(page, `/delivery-zones/${randomUUID()}/commands`, {
            action: 'CREATE',
            locationId: f.location.id,
            requestKey: randomUUID(),
            profile: { ...deliveryZoneProfile(), name: `Zonă paginată ${index}` },
          })
        ).status(),
      ).toBe(200);
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Zone de livrare');
    await expect(page.getByRole('heading', { name: /^Zonă paginată / })).toHaveCount(30);
    await page.getByRole('button', { name: 'Încarcă mai multe zone', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^Zonă paginată / })).toHaveCount(31);
    await page.route('**/api/tenant/delivery-zones?**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Zone temporar indisponibile' }),
      }),
    );
    await page.getByRole('button', { name: 'Reîncarcă zonele', exact: true }).click();
    await expect(page.getByText('Zone temporar indisponibile', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Zonă paginată / })).toHaveCount(0);
    await page.unroute('**/api/tenant/delivery-zones?**');
    await page.getByRole('button', { name: 'Reîncarcă zonele', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^Zonă paginată / })).toHaveCount(30);
  } finally {
    await f.dispose();
  }
});
