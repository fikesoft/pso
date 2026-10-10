import { test, expect } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createDatabaseClient } from '../../packages/db/src/index';
import { hashPassword } from '../../apps/api/src/crypto';
import { tenantOrigin, isLocal } from './support/browser.constants';
import {
  isolatedPage,
  navigateSection,
  adminViewports,
  submit,
  api,
  noOverflow,
  verifyMobileMenuKeyboard,
} from './support/browser-helpers';
import { loginAndActivate, makeAccount } from './support/authentication';
import { createCompany, createLocation, createRole, createStaff } from './support/provisioning';
test('fundația B: platformă → companie → MFA → delegare → lucrător → revocare directă', async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  if (process.env.NODE_ENV === 'production')
    throw new Error('Fixture-urile sintetice refuză mediul de producție.');
  const databaseUrl = process.env.PLATFORM_DATABASE_URL;
  if (!databaseUrl || !isLocal(databaseUrl))
    throw new Error('E2E necesită PLATFORM_DATABASE_URL locală configurată.');
  const db = createDatabaseClient(databaseUrl, 2);
  const suffix = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  const ownerAccount = makeAccount(`e2e-${suffix}`);
  const primary = makeAccount('admin');
  const foreignPrimary = makeAccount('admin');
  const ana = makeAccount('ana');
  const worker = makeAccount('chelner');
  const contexts: BrowserContext[] = [];
  const owner = await db.platformAdmin.create({
    data: {
      loginNormalized: ownerAccount.login,
      displayName: 'E2E Proprietar Sintetic',
      passwordHash: await hashPassword(ownerAccount.initialPassword),
      mustChangePassword: true,
      mfaRequired: true,
    },
  });
  try {
    const platform = await isolatedPage(browser, contexts);
    await loginAndActivate(platform, ownerAccount, { plane: 'platform', first: true });
    await platform.setViewportSize({ width: 360, height: 800 });
    await noOverflow(platform);
    await verifyMobileMenuKeyboard(platform);
    const slug = `e2e-${suffix}`;
    const company = await createCompany(platform, slug, `E2E Companie ${suffix}`, primary);
    await platform.screenshot({ path: testInfo.outputPath('platform-360.png'), fullPage: true });
    await platform.setViewportSize({ width: 1440, height: 900 });
    const otherCompany = await createCompany(
      platform,
      `${slug}-b`,
      `E2E Companie B ${suffix}`,
      foreignPrimary,
    );
    const admin = await isolatedPage(browser, contexts);
    await loginAndActivate(admin, primary, { slug, first: true });
    await navigateSection(admin, 'Locații');
    const a = await createLocation(admin, 'E2E Locația A', 'AA');
    const b = await createLocation(admin, 'E2E Locația B', 'BB');
    await navigateSection(admin, 'Roluri și permisiuni');
    const operationalLabels = [
      'Vizualizarea comenzilor',
      'Crearea comenzilor',
      'Vizualizarea bucătăriei',
    ];
    await createRole(admin, 'E2E Administrator local', [
      ...operationalLabels,
      'Vizualizarea locațiilor',
      'Vizualizarea personalului',
      'Crearea conturilor de personal',
      'Modificarea și dezactivarea personalului',
      'Resetarea parolelor subordonaților',
      'Vizualizarea rolurilor',
    ]);
    const workerRole = await createRole(admin, 'E2E Chelner', operationalLabels);
    await navigateSection(admin, 'Echipă');
    // Selecting only the second location must also update the role/preview scope.
    await createStaff(admin, makeAccount('chelner-b'), 'Chelner Locația B', 'E2E Chelner', b.name);
    const anaUser = await createStaff(
      admin,
      ana,
      'Ana Sintetică',
      'E2E Administrator local',
      a.name,
    );
    await adminViewports(admin, testInfo);
    await navigateSection(admin, 'Delegare');
    await admin.getByRole('button', { name: 'Adaugă plafon' }).click();
    const grantDialog = admin.getByRole('dialog', { name: 'Plafon nou de delegare' });
    await grantDialog.getByLabel('Administrator delegat').selectOption({ label: 'Ana Sintetică' });
    await grantDialog.getByRole('combobox', { name: 'Locație', exact: true }).selectOption(a.id);
    for (const label of operationalLabels)
      await grantDialog.getByRole('checkbox', { name: label, exact: true }).check();
    await grantDialog.getByRole('button', { name: 'Previzualizează accesul' }).click();
    await expect(
      grantDialog.getByRole('button', { name: 'Salvează plafonul de delegare' }),
    ).toBeEnabled();
    await submit(
      admin,
      '/api/tenant/delegations',
      grantDialog.getByRole('button', { name: 'Salvează plafonul de delegare' }),
    );
    await expect(grantDialog).not.toBeVisible();

    const anaPage = await isolatedPage(browser, contexts);
    await loginAndActivate(anaPage, ana, { slug, first: true });
    const anaContext = await (await api(anaPage, '/context')).json();
    expect(anaContext.locations.map((location: { id: string }) => location.id)).toEqual([a.id]);
    await navigateSection(anaPage, 'Echipă');
    const workerUser = await createStaff(
      anaPage,
      worker,
      'Chelner Sintetic',
      'E2E Chelner',
      a.name,
    );
    // Tampered requests use the same real browser cookie jar and current CSRF.
    expect(
      (
        await api(anaPage, `/staff/${workerUser.id}/overrides`, {
          permission: 'payments.refund',
          effect: 'ALLOW',
          scopeType: 'LOCATION',
          locationId: a.id,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await api(anaPage, `/staff/${workerUser.id}/assignments`, {
          roleVersionId: workerRole.versions[0]!.id,
          scopeType: 'LOCATION',
          locationId: b.id,
        })
      ).status(),
    ).toBe(403);
    expect(
      (await api(anaPage, `/staff/${company.primaryAdminUserId}/reset-password`, {})).status(),
    ).toBe(403);
    expect(
      (
        await api(anaPage, `/staff/${anaUser.id}/overrides`, {
          permission: 'orders.read',
          effect: 'ALLOW',
          scopeType: 'LOCATION',
          locationId: a.id,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await api(anaPage, '/delegations', {
          userId: workerUser.id,
          scopeType: 'LOCATION',
          locationId: a.id,
          permissions: [{ permission: 'orders.read' }],
        })
      ).status(),
    ).toBe(403);
    const foreignAttempt = await api(
      anaPage,
      `/staff/${otherCompany.primaryAdminUserId}/reset-password`,
      {},
    );
    expect([403, 404]).toContain(foreignAttempt.status());

    const workerPage = await isolatedPage(browser, contexts);
    await workerPage.setViewportSize({ width: 360, height: 800 });
    await loginAndActivate(workerPage, worker, { slug, first: true });
    const workerContext = await (await api(workerPage, '/context')).json();
    expect(workerContext.organization.id).toBe(company.id);
    expect(workerContext.locations.map((location: { id: string }) => location.id)).toEqual([a.id]);
    expect(
      workerContext.permissions.some(
        (entry: { permission: string; canUse: boolean; locationId: string }) =>
          entry.permission === 'orders.read' && entry.canUse && entry.locationId === a.id,
      ),
    ).toBe(true);
    expect(
      workerContext.permissions.some(
        (entry: { permission: string; canUse: boolean }) =>
          entry.permission === 'payments.refund' && entry.canUse,
      ),
    ).toBe(false);
    expect((await api(workerPage, '/staff')).status()).toBe(403);
    const cookie = (await workerPage.context().cookies()).find(
      (entry) => entry.name === 'pos_tenant',
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Strict');
    expect(cookie?.path).toBe('/api/tenant');
    expect(await workerPage.evaluate(() => Object.keys(localStorage))).toEqual([]);
    await noOverflow(workerPage);
    await workerPage.screenshot({ path: testInfo.outputPath('worker-360.png'), fullPage: true });

    // Creating a derived assignment revokes other sessions. The principal signs
    // in again with a fresh TOTP code before withdrawing the grant.
    await loginAndActivate(admin, primary, { slug });
    await navigateSection(admin, 'Delegare');
    await admin.getByRole('button', { name: 'Revocă', exact: true }).click();
    const revokeDialog = admin.getByRole('dialog', { name: 'Revocă plafonul de delegare' });
    await revokeDialog
      .getByLabel('Motivul revocării')
      .fill('Verificare automată a retragerii accesului derivat');
    await revokeDialog.getByRole('button', { name: 'Confirmă revocarea' }).click();
    await expect(revokeDialog).not.toBeVisible();
    expect((await workerPage.request.get(`${tenantOrigin}/api/tenant/context`)).status()).toBe(401);
    await loginAndActivate(workerPage, worker, { slug });
    const after = await (await api(workerPage, '/context')).json();
    expect(
      after.permissions.some(
        (entry: { permission: string; canUse: boolean }) =>
          entry.permission === 'orders.read' && entry.canUse,
      ),
    ).toBe(false);
    await navigateSection(admin, 'Jurnal de audit');
    await expect(admin.getByText('delegations.revoked', { exact: true })).toBeVisible();
    await noOverflow(admin);
    await admin.screenshot({ path: testInfo.outputPath('audit-revocation.png'), fullPage: true });
    // UI error state, without network mutation or external requests.
    await workerPage.context().setOffline(true);
    await expect(
      workerPage.getByRole('alert').filter({ hasText: 'Sunteți offline' }),
    ).toBeVisible();
    await workerPage.context().setOffline(false);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    // Only this test's unique platform account is disabled; seed accounts and
    // historical rows remain intact. There is no delete or database reset.
    await db.platformSession.updateMany({
      where: { platformAdminId: owner.id },
      data: { revokedAt: new Date() },
    });
    await db.platformAdmin.update({
      where: { id: owner.id },
      data: { status: 'DISABLED', authVersion: { increment: 1 } },
    });
    await db.$disconnect();
  }
});
