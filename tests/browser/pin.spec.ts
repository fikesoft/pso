import { randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createRole } from './support/provisioning';
import { tenantOrigin } from './support/browser.constants';
import {
  api,
  localOnly,
  navigateSection,
  noOverflow,
  session,
  submit,
  verifyMobileMenuKeyboard,
} from './support/browser-helpers';

test('personal PIN: creare → acces local pe mobil → resetare și revocarea codului vechi', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await operationsFixture(browser);
  const { admin, slug, location, otherLocation } = fixture;
  const workerContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await localOnly(workerContext);
  const worker = await workerContext.newPage();
  try {
    await navigateSection(admin, 'Roluri și permisiuni');
    await createRole(admin, 'E2E Personal PIN', [
      'Vizualizarea comenzilor',
      'Crearea comenzilor',
      'Vizualizarea bucătăriei',
    ]);
    await navigateSection(admin, 'Echipă');
    await admin.getByRole('button', { name: 'Adaugă persoană' }).click();
    const create = admin.getByRole('dialog', { name: 'Adaugă în echipă' });
    await expect(create.getByLabel('Metodă de autentificare')).toHaveValue('PIN');
    await expect(create.getByLabel('Parolă temporară (opțional)')).toHaveCount(0);
    await create.getByLabel('Numele persoanei').fill('Personal PIN Sintetic');
    await create.getByLabel('Login individual').fill('personal-pin');
    await create.getByRole('checkbox', { name: new RegExp(location.name) }).check();
    await create.getByLabel('Rol inițial').selectOption({ label: 'E2E Personal PIN · v1' });
    await expect(create.getByRole('combobox', { name: 'Locație', exact: true })).toHaveValue(
      location.id,
    );
    await create.getByRole('button', { name: 'Previzualizează accesul' }).click();
    await expect(create.getByRole('button', { name: 'Creează contul' })).toBeEnabled();
    const created = await submit(
      admin,
      '/api/tenant/staff',
      create.getByRole('button', { name: 'Creează contul' }),
    );
    expect(created.user.authenticationMethod).toBe('PIN');
    expect(created.pin).toMatch(/^[A-Z0-9]{9,32}$/);
    expect(created.temporaryPassword).toBeUndefined();
    const credential = admin.getByRole('dialog', { name: 'Cod PIN · afișat o singură dată' });
    await expect(credential.locator('code')).toHaveText(created.pin);
    await credential.getByRole('button', { name: 'Am salvat codul PIN în siguranță' }).click();
    await expect(credential).not.toBeVisible();

    await worker.goto(`${tenantOrigin}/c/${slug}/login`);
    await expect(worker.getByRole('button', { name: 'Personal · cod PIN' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(worker.getByLabel('Login', { exact: true })).toHaveCount(0);
    await expect(worker.getByLabel('Parolă', { exact: true })).toHaveCount(0);
    const pin = worker.getByLabel('Cod PIN', { exact: true });
    await expect(pin).toHaveAttribute('type', 'password');
    await noOverflow(worker);
    await worker.screenshot({ path: testInfo.outputPath('pin-login-360.png'), fullPage: true });
    await pin.fill(created.pin.toLowerCase());
    await expect(pin).toHaveValue(created.pin);
    await submit(
      worker,
      '/api/tenant/auth/pin',
      worker.getByRole('button', { name: 'Intră cu cod PIN' }),
    );
    await expect(worker.getByRole('heading', { name: /^Bun venit,/ })).toBeVisible();
    expect(await session(worker)).toMatchObject({
      stage: 'ready',
      user: { id: created.user.id, authenticationMethod: 'PIN', mustChangePassword: false },
    });
    const context = await (await api(worker, '/context')).json();
    expect(context.locations).toHaveLength(1);
    expect(context.locations[0].id).toBe(location.id);
    expect((await api(worker, `/orders?locationId=${otherLocation.id}`)).status()).toBe(403);
    await worker.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(worker, 'Comenzi');
    await expect(worker.getByRole('heading', { name: 'Comenzi', exact: true })).toBeVisible();
    await expect(worker.getByRole('button', { name: 'Comandă nouă', exact: true })).toBeEnabled();
    await verifyMobileMenuKeyboard(worker);
    await noOverflow(worker);
    expect(await worker.evaluate(() => Object.keys(localStorage))).toEqual([]);
    await worker.screenshot({ path: testInfo.outputPath('pin-worker-360.png'), fullPage: true });

    await admin.setViewportSize({ width: 360, height: 800 });
    const row = admin.getByRole('row').filter({ hasText: 'Personal PIN Sintetic' });
    await expect(row.getByText('Cod PIN', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Detalii și acces' }).click();
    await admin.getByRole('button', { name: 'Generează / resetează cod PIN' }).click();
    const reset = admin.getByRole('dialog', { name: 'Generează / resetează cod PIN' });
    const newPin = randomBytes(8).toString('hex').toUpperCase();
    await reset.getByLabel('Cod PIN personalizat (opțional)').fill(newPin.toLowerCase());
    await noOverflow(admin);
    const renewed = await submit(
      admin,
      `/api/tenant/staff/${created.user.id}/reset-pin`,
      reset.getByRole('button', { name: 'Confirmă noul cod PIN' }),
    );
    expect(renewed.pin).toBe(newPin);
    await expect(credential.locator('code')).toHaveText(newPin);
    await credential.getByRole('button', { name: 'Am salvat codul PIN în siguranță' }).click();
    expect((await worker.request.get(`${tenantOrigin}/api/tenant/context`)).status()).toBe(401);
    await worker.reload();
    await expect(pin).toBeVisible();
    await pin.fill(created.pin.toLowerCase());
    const rejected = worker.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/tenant/auth/pin' &&
        response.request().method() === 'POST',
    );
    await worker.getByRole('button', { name: 'Intră cu cod PIN' }).click();
    expect((await rejected).status()).toBe(401);
    await expect(
      worker.getByRole('alert').filter({ hasText: 'Date de autentificare invalide' }),
    ).toBeVisible();
    await pin.fill(newPin.toLowerCase());
    await submit(
      worker,
      '/api/tenant/auth/pin',
      worker.getByRole('button', { name: 'Intră cu cod PIN' }),
    );
    await expect(worker.getByRole('heading', { name: /^Bun venit,/ })).toBeVisible();
    expect((await session(worker)).user.id).toBe(created.user.id);
    await noOverflow(worker);
  } finally {
    await workerContext.close();
    await fixture.dispose();
  }
});
