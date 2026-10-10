import { test, expect } from '@playwright/test';
import { cashMovementsFixture, movementDetail, movementForm } from './cash-movements-setup';
import { submit } from './support/browser-helpers';

test('numerar UI: owner PIN introduce și retrage explicit, păstrează sumarul și istoricul responsive', async ({
  browser,
}, info) => {
  const f = await cashMovementsFixture(browser);
  try {
    const page = await f.login('movement');
    const opened = await f.open(
      page,
      '100',
      'Casă numerar cu denumire lungă pentru probă responsive',
    );
    const untouched = await f.open(page, '5', 'A doua casă proprie');
    await movementDetail(page, opened.register.code);
    let form = await movementForm(page, 'IN', '20');
    await page.keyboard.press('Escape');
    expect((await f.detail(opened.shift.id, page)).summary.expectedCash).toBe('100.00');
    await movementDetail(page, opened.register.code);
    form = await movementForm(page, 'IN', '20');
    const path = `/api/tenant/cash-shifts/${opened.shift.id}/movements`;
    const entered = await submit(
      page,
      path,
      form.getByRole('button', { name: 'Introdu numerar', exact: true }),
    );
    expect(entered.movement).toMatchObject({
      shiftId: opened.shift.id,
      amount: '20.00',
      direction: 'IN',
    });
    form = await movementForm(page, 'OUT', '7');
    const confirmation = form.getByLabel('Confirm retragerea numerarului din această tură', {
      exact: true,
    });
    await confirmation.uncheck();
    await expect(form.getByRole('button', { name: 'Retrage numerar', exact: true })).toBeDisabled();
    await confirmation.check();
    await submit(page, path, form.getByRole('button', { name: 'Retrage numerar', exact: true }));
    const detail = page.getByRole('dialog', { name: 'Detaliile turei', exact: true });
    await expect(detail.getByText('113.00 MDL', { exact: true })).toBeVisible();
    await detail.getByRole('button', { name: 'Mișcări de numerar', exact: true }).click();
    await expect(detail.getByRole('heading', { level: 4 })).toHaveCount(3);
    expect((await f.detail(untouched.shift.id, page)).shift.version).toBe(1);
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        detail.getByRole('button', { name: 'Introdu numerar', exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`cash-movements-${width}.png`),
        fullPage: true,
      });
    }
    expect((await f.detail(opened.shift.id, page)).summary).toMatchObject({
      expectedCash: '113.00',
      cashIn: '20.00',
      cashOut: '7.00',
      paidOrderCount: 0,
    });
  } finally {
    await f.dispose();
  }
});
