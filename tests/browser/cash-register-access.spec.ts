import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { cashRegisterFixture, registerCard } from './cash-register-setup';
import { api, localOnly, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

test('case: cititorul PIN vede numai case active locale fără administrare sau acces financiar implicit', async ({
  browser,
}) => {
  const f = await cashRegisterFixture(browser);
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await localOnly(context);
  try {
    const register = await f.create('READ', 'Casă pentru cititor');
    const roleResponse = await api(f.admin, '/roles', {
      name: 'Cititor case',
      permissions: [{ permission: 'cash.registers.read' }],
    });
    expect(roleResponse.status()).toBe(200);
    const { role } = await roleResponse.json();
    const actorResponse = await api(f.admin, '/staff', {
      login: 'register-reader',
      displayName: 'Cititor case',
      authenticationMethod: 'PIN',
      locationIds: [f.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.location.id },
      ],
    });
    expect(actorResponse.status()).toBe(200);
    const actor = await actorResponse.json();
    const page = await context.newPage();
    await page.goto(`${tenantOrigin}/c/${f.slug}/login`);
    await page.getByLabel('Cod PIN', { exact: true }).fill(actor.pin);
    await submit(
      page,
      '/api/tenant/auth/pin',
      page.getByRole('button', { name: 'Intră cu cod PIN', exact: true }),
    );
    await expect(page.getByRole('heading', { name: /^Bun venit,/ })).toBeVisible();
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Case');
    await expect(registerCard(page, 'Casă pentru cititor')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adaugă casă', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Redenumește', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Arhivează', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Starea caselor', { exact: true })).toHaveCount(0);
    await expect(
      page
        .getByRole('navigation', { name: 'Navigație principală', includeHidden: true })
        .getByRole('button', { name: 'Casier', exact: true, includeHidden: true }),
    ).toHaveCount(0);
    expect(
      (
        await api(f.admin, `/cash-registers/${register.id}/archive`, {
          locationId: f.location.id,
          requestKey: randomUUID(),
          version: 1,
        })
      ).status(),
    ).toBe(200);
    await page.getByRole('button', { name: 'Reîncarcă lista', exact: true }).click();
    await expect(registerCard(page, 'Casă pentru cititor')).toHaveCount(0);
  } finally {
    await context.close();
    await f.dispose();
  }
});
