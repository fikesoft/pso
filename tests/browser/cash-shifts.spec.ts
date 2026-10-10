import { test, expect } from '@playwright/test';
import { cashShiftsFixture, shiftOpenForm } from './cash-shifts-setup';
import { navigateSection, noOverflow, submit } from './support/browser-helpers';

test('ture: PIN deschide și închide prin UI, păstrează motivul diferenței și sumarul mobil', async ({
  browser,
}, info) => {
  const f = await cashShiftsFixture(browser);
  try {
    const register = await f.register('Casa numerar E2E');
    const page = await f.login();
    await navigateSection(page, 'Case');
    await expect(page.getByRole('heading', { name: 'Ture de casă', exact: true })).toBeVisible();
    let form = await shiftOpenForm(page, register.id, '100');
    await page.keyboard.press('Escape');
    expect(
      (await f.request(`/cash-shifts?locationId=${f.location.id}`, undefined, page)).shifts,
    ).toEqual([]);
    form = await shiftOpenForm(page, register.id, '100');
    const opened = await submit(
      page,
      `/api/tenant/cash-registers/${register.id}/open`,
      form.getByRole('button', { name: 'Deschide tura', exact: true }),
    );
    expect(opened.shift).toMatchObject({
      ownerUserId: f.actors.cashier!.user.id,
      openingAmount: '100.00',
    });
    const detail = page.getByRole('dialog', { name: 'Detaliile turei', exact: true });
    await expect(
      detail.getByRole('region', { name: 'Sumar local confirmat · MDL', exact: true }),
    ).toContainText('100.00 MDL');
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`shift-open-${width}.png`), fullPage: true });
    }
    await detail.getByRole('button', { name: 'Închide tura', exact: true }).click();
    const close = page.getByRole('dialog', { name: 'Închide tura', exact: true });
    await close.getByLabel('Numerar numărat (MDL)', { exact: true }).fill('99');
    await expect(close.getByLabel('Motivul diferenței', { exact: true })).toHaveAttribute(
      'required',
      '',
    );
    await close
      .getByLabel('Motivul diferenței', { exact: true })
      .fill('Diferență verificată la predarea turei');
    await close
      .getByLabel('Confirm numerarul numărat și închiderea definitivă a turei', { exact: true })
      .check();
    const closed = await submit(
      page,
      `/api/tenant/cash-shifts/${opened.shift.id}/close`,
      close.getByRole('button', { name: 'Închide tura', exact: true }),
    );
    expect(closed.closing).toMatchObject({
      expectedCash: '100.00',
      countedCash: '99.00',
      difference: '-1.00',
    });
    await expect(
      detail.getByRole('region', { name: 'Închiderea confirmată', exact: true }),
    ).toContainText('Diferență verificată');
    await expect(detail.getByRole('button', { name: 'Închide tura', exact: true })).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('shift-closed-360.png'), fullPage: true });
  } finally {
    await f.dispose();
  }
});
