import { test, expect } from '@playwright/test';
import { customerAnalyticsFixture } from './customer-analytics-setup';
import { api, localOnly, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

test('analiză CRM acces: PIN doar pentru citire, acoperire locală și revocare reală', async ({
  browser,
}) => {
  const f = await customerAnalyticsFixture(browser);
  const context = await browser.newContext();
  await localOnly(context);
  const page = await context.newPage();
  try {
    const roleResponse = await api(f.admin, '/roles', {
      name: 'Analiză PIN',
      permissions: ['customers.read', 'customers.analytics.read'].map((permission) => ({
        permission,
      })),
    });
    expect(roleResponse.status()).toBe(200);
    const { role } = await roleResponse.json();
    const orderRoleResponse = await api(f.admin, '/roles', {
      name: 'Comenzi locale analist',
      permissions: [{ permission: 'orders.read' }],
    });
    expect(orderRoleResponse.status()).toBe(200);
    const orderRole = (await orderRoleResponse.json()).role;
    const response = await api(f.admin, '/staff', {
      login: 'analytics-pin',
      displayName: 'Analist PIN',
      authenticationMethod: 'PIN',
      locationIds: [f.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'ORGANIZATION' },
        {
          roleVersionId: orderRole.versions[0].id,
          scopeType: 'LOCATION',
          locationId: f.location.id,
        },
      ],
    });
    expect(response.status()).toBe(200);
    const staff = await response.json();
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
    const report = page.getByRole('region', { name: 'Analiza clientului', exact: true });
    await expect(report.locator('dl').first()).toBeVisible();
    await expect(report.getByRole('region', { name: 'Segmentare RFM', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvează profilul', exact: true })).toHaveCount(
      0,
    );
    await report.getByLabel('Acoperirea analizei').selectOption('ORGANIZATION');
    await expect(
      report.getByText(`Locații incluse: ${f.location.name}`, { exact: true }),
    ).toBeVisible();
    const path = `/api/tenant/customers/${f.customer.id}/analytics`;
    await page.route(
      `**${path}?**`,
      async (route) => {
        expect(
          (
            await api(f.admin, `/staff/${staff.user.id}/overrides`, {
              permission: 'customers.analytics.read',
              effect: 'DENY',
              scopeType: 'ORGANIZATION',
            })
          ).status(),
        ).toBe(200);
        await route.continue();
      },
      { times: 1 },
    );
    const rejected = page.waitForResponse((r) => new URL(r.url()).pathname === path);
    await report.getByRole('button', { name: 'Recalculează analiza', exact: true }).click();
    expect([401, 403]).toContain((await rejected).status());
    await expect(page.getByText('5.00 MDL', { exact: true })).toHaveCount(0);
    await expect(report.locator('dl')).toHaveCount(0);
    await expect(report.getByRole('region', { name: 'Segmentare RFM', exact: true })).toHaveCount(
      0,
    );
  } finally {
    await context.close();
    await f.dispose();
  }
});
