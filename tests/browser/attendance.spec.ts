import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createRole } from './support/provisioning';
import { api, localOnly, navigateSection, noOverflow, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

test('pontaj PIN și profil HR: răspuns pierdut, pauze, istoric și raport pe mobil', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const fixture = await operationsFixture(browser);
  const { admin, slug, location, otherLocation } = fixture;
  const workerContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await localOnly(workerContext);
  const worker = await workerContext.newPage();
  try {
    await navigateSection(admin, 'Roluri și permisiuni');
    await createRole(admin, 'E2E Pontaj PIN', ['Pontarea turei proprii']);
    await navigateSection(admin, 'Echipă');
    await admin.getByRole('button', { name: 'Adaugă persoană' }).click();
    const create = admin.getByRole('dialog', { name: 'Adaugă în echipă' });
    await create.getByLabel('Numele persoanei').fill('Angajat Pontaj Sintetic');
    await create.getByLabel('Login individual').fill('attendance-pin');
    await create.getByLabel('Prenume', { exact: true }).fill('Angajat');
    await create.getByLabel('Nume de familie').fill('Sintetic');
    await create.getByLabel('Telefon angajat').fill('+37322000111');
    await create.getByLabel('Email angajat').fill('pontaj@example.invalid');
    await create.getByLabel('Cod angajat').fill('HR-E2E-01');
    await create.getByLabel('Data angajării').fill('2026-01-15');
    await create.getByRole('checkbox', { name: new RegExp(location.name) }).check();
    await create.getByLabel('Rol inițial').selectOption({ label: 'E2E Pontaj PIN · v1' });
    await create.getByRole('button', { name: 'Previzualizează accesul' }).click();
    const created = await submit(
      admin,
      '/api/tenant/staff',
      create.getByRole('button', { name: 'Creează contul' }),
    );
    expect(created.user.employeeCode).toBe('HR-E2E-01');
    await admin.getByRole('button', { name: 'Am salvat codul PIN în siguranță' }).click();

    await worker.goto(`${tenantOrigin}/c/${slug}/login`);
    await worker.getByLabel('Cod PIN', { exact: true }).fill(created.pin);
    await submit(
      worker,
      '/api/tenant/auth/pin',
      worker.getByRole('button', { name: 'Intră cu cod PIN' }),
    );
    await expect(worker.getByRole('heading', { name: /^Bun venit,/ })).toBeVisible();
    await worker.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(worker, 'Pontaj');
    const clock = worker.getByRole('region', { name: 'Tura mea', exact: true });
    const starts: unknown[] = [];
    await worker.route('**/api/tenant/attendance/start', async (route) => {
      starts.push(route.request().postDataJSON());
      if (starts.length === 1) {
        const committed = await route.fetch();
        expect(committed.status()).toBe(200);
        await route.abort('failed');
      } else await route.continue();
    });
    await clock.getByRole('button', { name: 'Începe tura', exact: true }).click();
    await expect(clock.getByText(/Rezultatul cererii nu este confirmat/)).toBeVisible();
    await expect(clock.getByRole('button', { name: 'Începe tura', exact: true })).toBeDisabled();
    await clock.getByRole('button', { name: 'Reîncearcă aceeași cerere' }).click();
    await expect(clock.getByText('La lucru', { exact: true })).toBeVisible();
    expect(starts).toHaveLength(2);
    expect(starts[1]).toEqual(starts[0]);
    await worker.unroute('**/api/tenant/attendance/start');
    const stored = await (
      await api(worker, `/attendance/shifts?locationId=${location.id}&userId=${created.user.id}`)
    ).json();
    expect(stored.shifts).toHaveLength(1);
    expect((await api(worker, `/attendance/current?locationId=${otherLocation.id}`)).status()).toBe(
      403,
    );
    await clock.getByRole('button', { name: 'Începe pauza', exact: true }).click();
    await expect(clock.getByText('În pauză', { exact: true })).toBeVisible();
    await clock.getByRole('button', { name: 'Încheie pauza', exact: true }).click();
    await expect(clock.getByText('La lucru', { exact: true })).toBeVisible();
    await clock.getByRole('button', { name: 'Începe pauza', exact: true }).click();
    await expect(clock.getByText('În pauză', { exact: true })).toBeVisible();
    await clock.getByRole('button', { name: 'Încheie tura', exact: true }).click();
    const finish = worker.getByRole('dialog', { name: 'Confirmă încheierea turei' });
    await finish.getByRole('button', { name: 'Încheie tura', exact: true }).click();
    await expect(finish).not.toBeVisible();
    await expect(clock.getByRole('button', { name: 'Începe tura', exact: true })).toBeEnabled();
    const history = worker.getByRole('region', { name: 'Istoricul turelor mele' });
    await expect(history.getByText('Încheiată', { exact: true })).toBeVisible();
    const shifts = await (
      await api(worker, `/attendance/shifts?locationId=${location.id}&userId=${created.user.id}`)
    ).json();
    expect(shifts.shifts[0].breaks).toHaveLength(2);
    expect(
      shifts.shifts[0].breaks.every((pause: { endedAt: string | null }) => pause.endedAt),
    ).toBe(true);
    expect(shifts.shifts[0].breaks[1].endedAt).toBe(shifts.shifts[0].endedAt);
    await noOverflow(worker);
    await worker.screenshot({
      path: info.outputPath('attendance-worker-mobile.png'),
      fullPage: true,
    });

    await admin.setViewportSize({ width: 360, height: 800 });
    await navigateSection(admin, 'Echipă');
    await admin
      .getByRole('row')
      .filter({ hasText: 'Angajat Pontaj Sintetic' })
      .getByRole('button', { name: 'Detalii și acces' })
      .click();
    const profile = admin.getByRole('region', { name: 'Profilul angajatului', exact: true });
    await expect(profile.getByText('HR-E2E-01', { exact: true })).toBeVisible();
    await expect(profile.getByText('pontaj@example.invalid', { exact: true })).toBeVisible();
    await expect(profile.getByText('Încheiată', { exact: true })).toBeVisible();
    await noOverflow(admin);
    await profile.getByText('HR-E2E-01', { exact: true }).scrollIntoViewIfNeeded();
    await admin.screenshot({
      path: info.outputPath('employee-profile-mobile.png'),
      fullPage: true,
    });
    await admin.getByRole('dialog').getByRole('button', { name: 'Editează', exact: true }).click();
    const edit = admin.getByRole('dialog');
    await expect(edit.getByLabel('Prenume', { exact: true })).toHaveValue('Angajat');
    await edit.getByLabel('Telefon angajat').fill('+37322000222');
    await edit.getByRole('button', { name: 'Salvează modificările' }).click();
    await expect(edit).not.toBeVisible();
    const updated = await (
      await api(admin, `/staff/${created.user.id}/profile?locationId=${location.id}`)
    ).json();
    expect(updated.profile.user.phone).toBe('+37322000222');
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(admin, 'Pontaj');
    const report = admin.getByRole('region', { name: 'Raport de pontaj', exact: true });
    await expect(
      report.getByRole('row').filter({ hasText: 'Angajat Pontaj Sintetic' }),
    ).toBeVisible();
    await noOverflow(admin);
    await admin.screenshot({
      path: info.outputPath('attendance-report-mobile.png'),
      fullPage: true,
    });
  } finally {
    await workerContext.close();
    await fixture.dispose();
  }
});
