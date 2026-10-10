import { test, expect } from '@playwright/test';
import { packingBrowserFixture } from './packing-setup';
import { api, localOnly, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

test('ambalare acces: revocarea blochează recuperarea și nu confirmă un rezultat necunoscut', async ({
  browser,
}) => {
  const f = await packingBrowserFixture(browser);
  const context = await browser.newContext();
  await localOnly(context);
  const page = await context.newPage();
  try {
    const roleResponse = await api(f.admin, '/roles', {
      name: 'Verificare ambalare',
      permissions: ['packing.read', 'packing.update'].map((permission) => ({ permission })),
    });
    expect(roleResponse.status()).toBe(200);
    const { role } = await roleResponse.json();
    const createdResponse = await api(f.admin, '/staff', {
      login: 'packing-local',
      displayName: 'Verificare ambalare',
      authenticationMethod: 'PIN',
      locationIds: [f.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.location.id },
      ],
    });
    expect(createdResponse.status()).toBe(200);
    const created = await createdResponse.json();
    await page.goto(`${tenantOrigin}/c/${f.slug}/login`);
    await page.getByLabel('Cod PIN', { exact: true }).fill(created.pin);
    await submit(
      page,
      '/api/tenant/auth/pin',
      page.getByRole('button', { name: 'Intră cu cod PIN', exact: true }),
    );
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Ambalare');
    await expect(page.getByRole('button', { name: 'Confirmă ambalarea', exact: true })).toHaveCount(
      0,
    );
    await page.route(
      `**${f.path}`,
      async (route) => {
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('failed');
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Începe verificarea', exact: true }).click();
    const resolve = page.getByRole('button', {
      name: 'Verifică rezultatul operației',
      exact: true,
    });
    await expect(resolve).toBeEnabled();
    await page.route('**/api/tenant/packing/commands/resolution', async (route) => {
      // Revoke after the click starts recovery, before its HTTP request reaches the API.
      // A live revocation may otherwise remove the button before Playwright can click it.
      expect(
        (
          await api(f.admin, `/staff/${created.user.id}/overrides`, {
            permission: 'packing.update',
            effect: 'DENY',
            scopeType: 'LOCATION',
            locationId: f.location.id,
          })
        ).status(),
      ).toBe(200);
      await route.continue();
    });
    const rejected = page.waitForResponse((response) =>
      response.url().endsWith('/api/tenant/packing/commands/resolution'),
    );
    await resolve.click();
    expect([401, 403]).toContain((await rejected).status());
    await expect(page.getByText('Operația a fost confirmată.', { exact: true })).toHaveCount(0);
    const current = await (await api(f.admin, `/packing/sessions/${f.session.id}`)).json();
    expect(current.session).toMatchObject({ version: 2, status: 'PACKING' });
  } finally {
    await context.close();
    await f.dispose();
  }
});
