import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, localOnly, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

test('alerte acces: configurare locală fără catalog/KDS, scope organizațional absent și revocare', async ({
  browser,
}) => {
  const f = await operationsFixture(browser);
  const context = await browser.newContext();
  await localOnly(context);
  const page = await context.newPage();
  try {
    const roleResponse = await api(f.admin, '/roles', {
      name: 'Praguri locale',
      permissions: [{ permission: 'kitchen.alerts.manage' }],
    });
    expect(roleResponse.status()).toBe(200);
    const { role } = await roleResponse.json();
    const createdResponse = await api(f.admin, '/staff', {
      login: 'alerts-local',
      displayName: 'Configurator local',
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
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Bucătărie');
    await page.getByRole('button', { name: 'Praguri de alertă', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Praguri de alertă', exact: true });
    await expect(
      panel.getByLabel('Aplică regula pentru', { exact: true }).locator('option'),
    ).toHaveCount(1);
    const warning = panel.getByLabel('Avertizare după (secunde)', { exact: true });
    await warning.fill('20');
    await panel.getByLabel('Critic după (secunde)', { exact: true }).fill('40');
    await page.route(
      '**/api/tenant/kitchen-alerts',
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort('failed');
      },
      { times: 1 },
    );
    await panel.getByRole('button', { name: 'Salvează pragurile', exact: true }).click();
    const resolve = panel.getByRole('button', {
      name: 'Verifică rezultatul operației',
      exact: true,
    });
    await expect(resolve).toBeVisible();
    const denied = await api(f.admin, `/staff/${created.user.id}/overrides`, {
      permission: 'kitchen.alerts.manage',
      effect: 'DENY',
      scopeType: 'LOCATION',
      locationId: f.location.id,
    });
    expect(denied.status()).toBe(200);
    const response = page.waitForResponse((result) =>
      result.url().endsWith('/api/tenant/kitchen-alert-commands/resolution'),
    );
    await resolve.click();
    expect([401, 403]).toContain((await response).status());
    await expect(page.getByText('Operația a fost confirmată.', { exact: true })).toHaveCount(0);
    const ruleResponse = await api(f.admin, '/kitchen-alerts/read', {
      scope: { scopeType: 'LOCATION', locationId: f.location.id },
      target: { kind: 'DEFAULT' },
    });
    expect(ruleResponse.status()).toBe(200);
    expect((await ruleResponse.json()).rule).toMatchObject({
      version: 1,
      thresholds: { warningSeconds: 20, criticalSeconds: 40 },
    });
  } finally {
    await context.close();
    await f.dispose();
  }
});
