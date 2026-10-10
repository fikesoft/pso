import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, localOnly, noOverflow, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

test('fotografia proprie este disponibilă angajatului PIN fără drept de administrare', async ({
  browser,
}, info) => {
  test.setTimeout(120_000);
  const fixture = await operationsFixture(browser);
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await localOnly(context);
  const worker = await context.newPage();
  try {
    const created = await api(fixture.admin, '/staff', {
      login: 'self-photo-worker',
      displayName: 'Fotografie Proprie PIN',
      authenticationMethod: 'PIN',
      locationIds: [fixture.location.id],
    });
    expect(created.status()).toBe(200);
    const identity = await created.json();
    await worker.goto(`${tenantOrigin}/c/${fixture.slug}/login`);
    await worker.getByLabel('Cod PIN', { exact: true }).fill(identity.pin);
    await submit(
      worker,
      '/api/tenant/auth/pin',
      worker.getByRole('button', { name: 'Intră cu cod PIN' }),
    );
    await expect(worker.getByRole('heading', { name: /^Bun venit,/ })).toBeVisible();
    await expect(worker.getByText('Cod PIN personal configurat', { exact: true })).toBeVisible();
    await expect(worker.getByText('Parolă personală configurată', { exact: true })).toHaveCount(0);
    const image = worker.getByRole('region', { name: 'Fotografia angajatului' });
    await expect(image.getByText('Fără imagine')).toBeVisible();
    await image.getByLabel('Alege fotografia').setInputFiles({
      name: 'avatar-pin.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFElEQVQImWM448JwxoUBhM+4MAAAIP4EQeprLZYAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await image.getByRole('button', { name: 'Salvează fotografia' }).click();
    await expect(image.getByRole('img')).toBeVisible();
    await expect
      .poll(() => image.getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(2);
    const profile = await api(worker, `/staff/${identity.user.id}/profile`);
    expect(profile.status()).toBe(200);
    expect((await profile.json()).profile.user.avatarUrl).toContain('/avatar?assetId=');
    expect((await api(worker, '/staff')).status()).toBe(403);
    await image.scrollIntoViewIfNeeded();
    await noOverflow(worker);
    await worker.screenshot({
      path: info.outputPath('employee-photo-pin-mobile.png'),
      fullPage: true,
    });
    await image.getByRole('button', { name: 'Elimină fotografia', exact: true }).click();
    const clear = worker.getByRole('dialog', { name: 'Elimină fotografia afișată?' });
    await clear.getByRole('button', { name: 'Elimină fotografia', exact: true }).click();
    await expect(clear).not.toBeVisible();
    await expect(image.getByText('Fără imagine')).toBeVisible();
  } finally {
    await context.close();
    await fixture.dispose();
  }
});
