import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { cashRegisterFixture, newRegisterForm, registerCard } from './cash-register-setup';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('case: creare, conflict de redenumire, arhivare confirmată și izolare între locații', async ({
  browser,
}, info) => {
  const f = await cashRegisterFixture(browser);
  const page = f.admin;
  try {
    await navigateSection(page, 'Case');
    await expect(
      page.getByRole('heading', { name: 'Nu există case în această listă', exact: true }),
    ).toBeVisible();
    const form = await newRegisterForm(page, 'pos_1', 'Casa principală');
    const save = form.getByRole('button', { name: 'Salvează', exact: true });
    await save.focus();
    const saving = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/tenant/cash-registers') &&
        response.request().method() === 'POST',
    );
    await page.keyboard.press('Enter');
    const response = await saving;
    expect(response.status()).toBe(200);
    const { register } = await response.json();
    expect(register).toMatchObject({ code: 'POS_1', name: 'Casa principală', version: 1 });
    await expect(form).not.toBeVisible();
    for (const size of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ]) {
      await page.setViewportSize(size);
      const card = registerCard(page, 'Casa principală');
      await expect(card).toContainText('Codul casei: POS_1');
      await card.getByRole('button', { name: 'Redenumește', exact: true }).focus();
      await expect(card.getByRole('button', { name: 'Redenumește', exact: true })).toBeFocused();
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`register-${size.width}.png`),
        fullPage: true,
      });
    }
    await registerCard(page, 'Casa principală')
      .getByRole('button', { name: 'Redenumește', exact: true })
      .click();
    const rename = page.getByRole('dialog', { name: 'Redenumește', exact: true });
    await expect(rename.getByLabel('Codul casei', { exact: true })).toHaveCount(0);
    const concurrent = await api(
      page,
      `/cash-registers/${register.id}`,
      { locationId: f.location.id, version: 1, requestKey: randomUUID(), name: 'Casa concurentă' },
      'PATCH',
    );
    expect(concurrent.status()).toBe(200);
    await rename.getByLabel('Denumirea casei', { exact: true }).fill('Versiune veche');
    const conflict = page.waitForResponse(
      (value) =>
        value.url().endsWith(`/cash-registers/${register.id}`) &&
        value.request().method() === 'PATCH',
    );
    await rename.getByRole('button', { name: 'Salvează', exact: true }).click();
    expect((await conflict).status()).toBe(409);
    await expect(
      rename.getByText('Datele trebuie reîncărcate înainte de a începe o nouă operație.', {
        exact: true,
      }),
    ).toBeVisible();
    await rename.getByRole('button', { name: 'Reîncarcă lista', exact: true }).click();
    await expect(rename).not.toBeVisible();
    await registerCard(page, 'Casa concurentă')
      .getByRole('button', { name: 'Redenumește', exact: true })
      .click();
    await rename.getByLabel('Denumirea casei', { exact: true }).fill('Casa finală');
    const changed = page.waitForResponse(
      (value) =>
        value.url().endsWith(`/cash-registers/${register.id}`) &&
        value.request().method() === 'PATCH',
    );
    await rename.getByRole('button', { name: 'Salvează', exact: true }).click();
    expect((await changed).status()).toBe(200);
    await registerCard(page, 'Casa finală')
      .getByRole('button', { name: 'Arhivează', exact: true })
      .click();
    const archive = page.getByRole('dialog', { name: 'Arhivarea casei', exact: true });
    await expect(archive.getByRole('button', { name: 'Arhivează', exact: true })).toBeDisabled();
    await archive.getByLabel('Confirmă arhivarea', { exact: true }).check();
    await submit(
      page,
      `/api/tenant/cash-registers/${register.id}/archive`,
      archive.getByRole('button', { name: 'Arhivează', exact: true }),
    );
    await expect(registerCard(page, 'Casa finală')).toHaveCount(0);
    await page.getByLabel('Starea caselor', { exact: true }).selectOption('ARCHIVED');
    await expect(registerCard(page, 'Casa finală')).toContainText('Arhivată');
    await expect(registerCard(page, 'Casa finală').getByRole('button')).toHaveCount(0);
    await f.create('NORD', 'Casa din Nord', f.otherLocation.id);
    await page
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.otherLocation.id);
    await expect(registerCard(page, 'Casa din Nord')).toBeVisible();
    await expect(registerCard(page, 'Casa finală')).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});
