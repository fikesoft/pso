import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection, noOverflow } from './support/browser-helpers';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFElEQVQImWM448JwxoUBhM+4MAAAIP4EQeprLZYAAAAASUVORK5CYII=',
  'base64',
);
const photo = { name: 'fotografie-sintetica.png', mimeType: 'image/png', buffer: png };

test('fotografii locale: retry identic, versiune HR, catalog și eliminare pe mobil', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const fixture = await operationsFixture(browser);
  const { admin, location } = fixture;
  try {
    const employeeResponse = await api(admin, '/staff', {
      login: 'media-worker',
      displayName: 'Angajat Fotografii',
      authenticationMethod: 'PIN',
      locationIds: [location.id],
      employeeCode: 'MEDIA-01',
    });
    expect(employeeResponse.status()).toBe(200);
    const employee = (await employeeResponse.json()).user;
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(admin, 'Echipă');
    await admin
      .getByRole('row')
      .filter({ hasText: 'Angajat Fotografii' })
      .getByRole('button', { name: 'Detalii și acces' })
      .click();
    const profile = admin.getByRole('region', { name: 'Profilul angajatului', exact: true });
    const avatar = admin.getByRole('region', { name: 'Fotografia angajatului', exact: true });
    await expect(avatar.getByText('Fără imagine')).toBeVisible();
    await avatar.getByLabel('Alege fotografia').setInputFiles({
      name: 'unsafe.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg/>'),
    });
    await expect(avatar.getByText(/Alege un fișier JPEG/)).toBeVisible();
    await expect(avatar.getByRole('button', { name: 'Salvează fotografia' })).toBeDisabled();
    const [chooser] = await Promise.all([
      admin.waitForEvent('filechooser'),
      avatar.getByRole('button', { name: 'Alege fotografia', exact: true }).click(),
    ]);
    await chooser.setFiles(photo);
    const requests: { url: string; body: string | null }[] = [];
    const uploadPath = `/api/tenant/staff/${employee.id}/avatar`;
    const matchesUpload = (url: URL) => url.pathname === uploadPath;
    await admin.route(matchesUpload, async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      requests.push({
        url: route.request().url(),
        body: route.request().postDataBuffer()?.toString('base64') ?? null,
      });
      if (requests.length === 1) {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort('failed');
      } else await route.continue();
    });
    await avatar.getByRole('button', { name: 'Salvează fotografia' }).click();
    await expect(avatar.getByText(/Rezultatul cererii nu este confirmat/)).toBeVisible();
    await expect(profile.getByRole('button', { name: 'Reîncarcă profilul' })).toBeDisabled();
    await admin.keyboard.press('Escape');
    await expect(profile).toBeVisible();
    await avatar.getByRole('button', { name: 'Reîncearcă aceeași cerere' }).click();
    await expect(avatar.getByRole('img', { name: 'Fotografia angajatului' })).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    await admin.unroute(matchesUpload);
    await expect
      .poll(() => avatar.getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(2);
    const stored = (
      await (await api(admin, `/staff/${employee.id}/profile?locationId=${location.id}`)).json()
    ).profile.user;
    expect(stored.version).toBe(employee.version + 1);
    await admin.getByRole('dialog').getByRole('button', { name: 'Editează', exact: true }).click();
    const editEmployee = admin.getByRole('dialog');
    await editEmployee.getByLabel('Telefon angajat').fill('+37322000333');
    await editEmployee.getByRole('button', { name: 'Salvează modificările' }).click();
    await expect(editEmployee).not.toBeVisible();
    expect(
      (await (await api(admin, `/staff/${employee.id}/profile?locationId=${location.id}`)).json())
        .profile.user.phone,
    ).toBe('+37322000333');

    const productResponse = await api(admin, '/catalog/products', {
      name: 'Produs Fotografie',
      sku: `MEDIA-${randomUUID().slice(0, 8)}`,
      locationId: location.id,
      price: '35.0000',
    });
    expect(productResponse.status()).toBe(200);
    const product = (await productResponse.json()).product;
    await navigateSection(admin, 'Catalog');
    const card = admin
      .locator('article')
      .filter({ has: admin.getByRole('heading', { name: product.name }) });
    await card.getByRole('button', { name: 'Editează', exact: true }).click();
    const editProduct = admin.getByRole('dialog', { name: 'Editează produsul', exact: true });
    const image = editProduct.getByRole('region', { name: 'Imaginea produsului' });
    await image.getByLabel('Alege fotografia').setInputFiles(photo);
    await image.getByRole('button', { name: 'Salvează fotografia' }).click();
    await expect(image.getByRole('img', { name: 'Imaginea produsului' })).toBeVisible();
    await expect
      .poll(() =>
        image
          .getByRole('img', { name: 'Imaginea produsului' })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(2);
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await image.scrollIntoViewIfNeeded();
    await admin.screenshot({ path: info.outputPath('product-photo-mobile.png'), fullPage: true });
    await editProduct.getByRole('button', { name: 'Anulează', exact: true }).click();
    await expect(card.getByRole('img', { name: product.name })).toBeVisible();
    const current = (
      await (await api(admin, `/catalog/products/${product.id}?locationId=${location.id}`)).json()
    ).product;
    const oldUrl = current.imageUrl;
    await card.getByRole('button', { name: 'Editează', exact: true }).click();
    await image.getByRole('button', { name: 'Elimină fotografia', exact: true }).click();
    const clear = admin.getByRole('dialog', { name: 'Elimină fotografia afișată?' });
    await clear.getByRole('button', { name: 'Elimină fotografia', exact: true }).click();
    await expect(clear).not.toBeVisible();
    await expect(image.getByText('Fără imagine')).toBeVisible();
    expect((await admin.request.get(oldUrl)).status()).toBe(404);
    await editProduct.getByRole('button', { name: 'Anulează', exact: true }).click();
    await expect(card.getByRole('img')).toHaveCount(0);
    await noOverflow(admin);
  } finally {
    await fixture.dispose();
  }
});
