import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('programele meniului: creare recuperată, conflict, arhivare și actualizare POS fără pierderea ciornei', async ({
  browser,
}, testInfo) => {
  const fixture = await operationsFixture(browser);
  const { admin, location } = fixture;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    await admin.getByRole('button', { name: 'Programarea meniurilor', exact: true }).click();
    await admin.getByRole('button', { name: 'Adaugă program', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: 'Adaugă program', exact: true });
    await dialog.getByLabel('Denumirea programului').fill('Mic dejun eveniment');
    await dialog.getByLabel('Eveniment (opțional)', { exact: true }).fill('Eveniment sintetic');
    await dialog.getByLabel('Ora de început').fill('00:00');
    await dialog.getByLabel('Sfârșit la 24:00').check();
    await dialog.getByLabel('Din data (opțional)', { exact: true }).fill('1970-01-01');
    await dialog.getByLabel('Până la data (opțional)', { exact: true }).fill('1970-01-01');
    await dialog.getByRole('checkbox', { name: 'Cafea sintetică', exact: true }).check();
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({ path: testInfo.outputPath('menu-schedule-360.png'), fullPage: true });
    let lost = false;
    await admin.route('**/api/tenant/catalog/menu-schedules', async (route) => {
      if (!lost && route.request().method() === 'POST') {
        lost = true;
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('connectionfailed');
      } else await route.continue();
    });
    await dialog.getByRole('button', { name: 'Salvează programul', exact: true }).click();
    await expect(dialog.getByText(/Răspunsul la creare nu a fost confirmat/)).toBeVisible();
    await expect(dialog.getByLabel('Denumirea programului')).toBeDisabled();
    const created = await submit(
      admin,
      '/api/tenant/catalog/menu-schedules',
      dialog.getByRole('button', { name: 'Reîncearcă aceeași creare' }),
    );
    await expect(dialog).not.toBeVisible();
    const schedules = await (
      await api(admin, `/catalog/menu-schedules?locationId=${location.id}&includeArchived=true`)
    ).json();
    expect(schedules.schedules).toHaveLength(1);
    await admin.setViewportSize({ width: 1440, height: 900 });
    await admin
      .getByRole('button', { name: 'Editează programul: Mic dejun eveniment', exact: true })
      .click();
    const edit = admin.getByRole('dialog', { name: 'Editează programul', exact: true });
    const body = {
      name: 'Mic dejun actualizat',
      eventName: 'Eveniment sintetic',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startMinute: 0,
      endMinute: 1440,
      startsOn: '1970-01-01',
      endsOn: '1970-01-01',
      productIds: [product.id],
      status: 'ACTIVE',
      version: created.schedule.version,
    };
    expect(
      (await api(admin, `/catalog/menu-schedules/${created.schedule.id}`, body, 'PATCH')).status(),
    ).toBe(200);
    await edit.getByLabel('Stare', { exact: true }).selectOption('ARCHIVED');
    await edit.getByRole('button', { name: 'Salvează programul', exact: true }).click();
    await expect(edit.getByRole('alert')).toContainText('Programul a fost modificat. Reîncărcați.');
    await edit.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await expect(edit.getByLabel('Denumirea programului')).toHaveValue('Mic dejun actualizat');
    await edit.getByLabel('Stare', { exact: true }).selectOption('ARCHIVED');
    const update = admin.waitForResponse(
      (response) =>
        response.url().endsWith(`/menu-schedules/${created.schedule.id}`) &&
        response.request().method() === 'PATCH',
    );
    await edit.getByRole('button', { name: 'Salvează programul', exact: true }).click();
    const archived = (await (await update).json()).schedule;
    await expect(edit).not.toBeVisible();
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = admin.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await draft.getByLabel('Masa', { exact: true }).fill('19');
    const add = draft.getByRole('button', { name: /Cafea sintetică/ });
    await expect(add).toBeEnabled();
    await add.click();
    expect(
      (
        await api(
          admin,
          `/catalog/menu-schedules/${created.schedule.id}`,
          { ...body, version: archived.version },
          'PATCH',
        )
      ).status(),
    ).toBe(200);
    const refreshed = admin.waitForResponse((response) =>
      response.url().includes('/catalog/menu-availability?'),
    );
    await admin.evaluate(() => window.dispatchEvent(new Event('focus')));
    expect((await refreshed).status()).toBe(200);
    await expect(add).toBeDisabled();
    await expect(draft.getByLabel('Masa', { exact: true })).toHaveValue('19');
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('1');
    await draft.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    await expect(draft.getByText(/în afara programului/i).first()).toBeVisible();
  } finally {
    await fixture.dispose();
  }
});
