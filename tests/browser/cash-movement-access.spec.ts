import { test, expect } from '@playwright/test';
import { cashMovementsFixture, movementDetail, movementForm } from './cash-movements-setup';
import { cashPointers, shiftCard } from './cash-shifts-setup';
import { navigateSection, submit } from './support/browser-helpers';

test('numerar acces: managerul nu operează sertarul altuia, OUT insuficient nu produce efect, refreshul eșuat rămâne confirmat', async ({
  browser,
}) => {
  const f = await cashMovementsFixture(browser);
  try {
    const page = await f.login('movement');
    const { shift, register } = await f.open(page, '10');
    await f.admin
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.location.id);
    await navigateSection(f.admin, 'Case');
    await f.admin.getByLabel('Operatorii turelor', { exact: true }).selectOption('ALL');
    await shiftCard(f.admin, register.code)
      .getByRole('button', { name: 'Detaliile turei', exact: true })
      .click();
    await expect(f.admin.getByRole('button', { name: 'Introdu numerar', exact: true })).toHaveCount(
      0,
    );
    await expect(f.admin.getByRole('button', { name: 'Retrage numerar', exact: true })).toHaveCount(
      0,
    );
    await movementDetail(page, register.code);
    let form = await movementForm(page, 'OUT', '11');
    const path = `/api/tenant/cash-shifts/${shift.id}/movements`;
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === path && r.request().method() === 'POST',
    );
    await form.getByRole('button', { name: 'Retrage numerar', exact: true }).click();
    expect((await response).status()).toBe(409);
    await expect(form.getByLabel('Sumă (MDL)', { exact: true })).toBeDisabled();
    expect(await cashPointers(page, 'CASH')).toEqual([]);
    expect((await f.detail(shift.id, page)).summary.expectedCash).toBe('10.00');
    await form.getByRole('button', { name: 'Reîncarcă turele', exact: true }).click();
    form = await movementForm(page, 'OUT', '7');
    await page.route(`**/api/tenant/cash-shifts/${shift.id}?**`, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Detaliul nu poate fi recitit', code: 'INTERNAL_ERROR' }),
      }),
    );
    const result = await submit(
      page,
      path,
      form.getByRole('button', { name: 'Retrage numerar', exact: true }),
    );
    expect(result.movement.amount).toBe('7.00');
    await expect(page.getByText('Detaliul nu poate fi recitit', { exact: true })).toBeVisible();
    expect(await cashPointers(page, 'CASH')).toEqual([]);
    await expect(
      page.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    ).toHaveCount(0);
    await page.unroute(`**/api/tenant/cash-shifts/${shift.id}?**`);
    expect((await f.detail(shift.id, page)).summary.expectedCash).toBe('3.00');
  } finally {
    await f.dispose();
  }
});

test('numerar listă: refuzul paginii2 elimină mișcările deja încărcate', async ({ browser }) => {
  const f = await cashMovementsFixture(browser);
  try {
    const page = await f.login('movement');
    const { shift, register } = await f.open(page, '10');
    await f.move(shift.id, page);
    await page.route(`**/api/tenant/cash-shifts/${shift.id}/movements?**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('cursor'))
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Acces retras la mișcări', code: 'REQUEST_REJECTED' }),
        });
      url.searchParams.set('limit', '1');
      await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
    });
    const detail = await movementDetail(page, register.code);
    await detail.getByRole('button', { name: 'Mișcări de numerar', exact: true }).click();
    await expect(detail.getByRole('heading', { level: 4 })).toHaveCount(1);
    await detail.getByRole('button', { name: 'Mai multe mișcări', exact: true }).click();
    await expect(detail.getByText('Acces retras la mișcări', { exact: true })).toBeVisible();
    await expect(detail.getByRole('heading', { level: 4 })).toHaveCount(0);
  } finally {
    await f.dispose();
  }
});
