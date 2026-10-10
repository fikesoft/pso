import { test, expect } from '@playwright/test';
import { cashPointers, cashShiftsFixture, shiftCard, shiftOpenForm } from './cash-shifts-setup';
import { navigateSection, submit } from './support/browser-helpers';

test('ture acces: citirea și închiderea managerială cer capabilități distincte și motiv explicit', async ({
  browser,
}) => {
  const f = await cashShiftsFixture(browser);
  try {
    const cashier = await f.login();
    const opened = await f.open(cashier, '0');
    const reader = await f.login('reader');
    await navigateSection(reader, 'Case');
    await expect(reader.getByRole('heading', { name: 'Ture de casă', exact: true })).toBeVisible();
    await expect(reader.getByRole('button', { name: 'Deschide tura', exact: true })).toHaveCount(0);
    await expect(reader.getByLabel('Operatorii turelor', { exact: true })).toHaveCount(0);
    await expect(reader.getByRole('button', { name: 'Detaliile turei', exact: true })).toHaveCount(
      0,
    );
    const closeOnly = await f.login('closeOnly');
    await expect(
      closeOnly.getByRole('navigation').getByRole('button', { name: 'Case', exact: true }),
    ).toHaveCount(0);
    await f.admin
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.location.id);
    await navigateSection(f.admin, 'Case');
    await f.admin.getByLabel('Operatorii turelor', { exact: true }).selectOption('ALL');
    await shiftCard(f.admin, opened.register.code)
      .getByRole('button', { name: 'Detaliile turei', exact: true })
      .click();
    await f.admin
      .getByRole('dialog', { name: 'Detaliile turei', exact: true })
      .getByRole('button', { name: 'Închide tura', exact: true })
      .click();
    const close = f.admin.getByRole('dialog', { name: 'Închide tura', exact: true });
    await close.getByLabel('Numerar numărat (MDL)', { exact: true }).fill('0');
    const reason = close.getByLabel('Motivul închiderii turei altui operator', { exact: true });
    await expect(reason).toHaveAttribute('required', '');
    await reason.fill('Închidere la schimbarea operatorului');
    await close
      .getByLabel('Confirm numerarul numărat și închiderea definitivă a turei', { exact: true })
      .check();
    const result = await submit(
      f.admin,
      `/api/tenant/cash-shifts/${opened.shift.id}/close`,
      close.getByRole('button', { name: 'Închide tura', exact: true }),
    );
    expect(result.shift.ownerUserId).toBe(f.actors.cashier!.user.id);
    expect(result.closing.closedByUserId).not.toBe(result.shift.ownerUserId);
    expect(result.closing.managerReason).toBe('Închidere la schimbarea operatorului');
  } finally {
    await f.dispose();
  }
});

test('ture acces: pagina refuzată elimină lista, iar refreshul eșuat după OPEN păstrează efectul confirmat', async ({
  browser,
}) => {
  const f = await cashShiftsFixture(browser);
  try {
    const page = await f.login();
    await f.open(page, '0', 'Prima tură vizibilă');
    await f.open(page, '0', 'A doua tură vizibilă');
    const nextRegister = await f.register('Tură confirmată la refresh eșuat');
    await page.route('**/api/tenant/cash-shifts?**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('cursor'))
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'REQUEST_REJECTED',
            error: 'Citirea turelor a fost retrasă',
          }),
        });
      url.searchParams.set('limit', '1');
      await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
    });
    await navigateSection(page, 'Case');
    await expect(page.getByRole('button', { name: 'Detaliile turei', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Mai multe ture', exact: true }).click();
    await expect(page.getByText('Citirea turelor a fost retrasă', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Detaliile turei', exact: true })).toHaveCount(0);
    await page.unroute('**/api/tenant/cash-shifts?**');
    await page.getByRole('button', { name: 'Reîncarcă turele', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Detaliile turei', exact: true })).toHaveCount(2);
    const form = await shiftOpenForm(page, nextRegister.id, '0');
    await page.route('**/api/tenant/cash-shifts?**', async (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'INTERNAL_ERROR',
          error: 'Lista turelor nu poate fi recitită',
        }),
      }),
    );
    const opened = await submit(
      page,
      `/api/tenant/cash-registers/${nextRegister.id}/open`,
      form.getByRole('button', { name: 'Deschide tura', exact: true }),
    );
    await expect(page.getByRole('dialog', { name: 'Detaliile turei', exact: true })).toBeVisible();
    expect(await cashPointers(page, 'CASH')).toEqual([]);
    await expect(
      page.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(
      page.getByText('Lista turelor nu poate fi recitită', { exact: true }),
    ).toBeVisible();
    await page.unroute('**/api/tenant/cash-shifts?**');
    expect((await f.detail(opened.shift.id)).shift.status).toBe('OPEN');
  } finally {
    await f.dispose();
  }
});
