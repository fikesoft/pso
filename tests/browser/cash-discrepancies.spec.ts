import { test, expect } from '@playwright/test';
import {
  cashDiscrepanciesFixture,
  discrepancySection,
  smallReportPages,
} from './cash-discrepancies-setup';
import { enterDiscrepancyDates } from './cash-movements-setup';
import { navigateSection } from './support/browser-helpers';

test('diferențe UI: reporter fără gestionare vede casa arhivată, opțiunile complete și snapshoturi distincte pe mobil', async ({
  browser,
}, info) => {
  const f = await cashDiscrepanciesFixture(browser);
  try {
    const page = await f.login('reporter');
    await smallReportPages(page);
    await navigateSection(page, 'Case');
    await expect(page.getByRole('button', { name: 'Adaugă casă', exact: true })).toHaveCount(0);
    const report = discrepancySection(page);
    await expect(report.getByRole('article')).toHaveCount(0);
    await enterDiscrepancyDates(page, f.date);
    await expect(report.getByRole('article')).toHaveCount(1);
    const selector = report.getByLabel('Casa din raport', { exact: true });
    await expect(selector.locator('option')).toHaveCount(2);
    for (let count = 3; count <= 4; count++) {
      await report.getByRole('button', { name: 'Mai multe case istorice', exact: true }).click();
      await expect(selector.locator('option')).toHaveCount(count);
    }
    await expect(report.getByRole('article')).toHaveCount(1);
    await expect(selector.locator(`option[value="${f.archived.register.id}"]`)).toHaveText(
      `${f.archived.register.code} · Denumirea istorică cea mai recentă`,
    );
    await selector.selectOption(f.archived.register.id);
    await report.getByRole('button', { name: 'Aplică filtrele', exact: true }).click();
    await expect(report.getByRole('article')).toHaveCount(1);
    await report.getByRole('button', { name: 'Mai multe închideri', exact: true }).click();
    await expect(report.getByRole('article')).toHaveCount(2);
    await expect(
      report.getByRole('heading', {
        name: `${f.archived.register.code} · Casă istorică 0`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      report.getByRole('heading', {
        name: `${f.archived.register.code} · Denumirea istorică cea mai recentă`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(report.getByText(/Europe\/Chisinau/)).toBeVisible();
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await report.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`cash-discrepancies-${width}.png`),
        fullPage: true,
      });
    }
    await report.getByLabel('Diferențe', { exact: true }).selectOption('NONZERO');
    await report.getByRole('button', { name: 'Aplică filtrele', exact: true }).click();
    await expect(report.getByRole('article')).toHaveCount(1);
    await report.getByRole('button', { name: 'Mai multe case istorice', exact: true }).click();
    await expect(selector.locator('option')).toHaveCount(3);
    await expect(selector.locator(`option[value="${f.closed[1]!.register.id}"]`)).toHaveCount(0);
    await report.getByRole('button', { name: 'Resetează filtrele', exact: true }).click();
    await expect(report.getByRole('article')).toHaveCount(0);
    await expect(report.getByLabel('Închideri de la', { exact: true })).toHaveValue('');
    await expect(selector.locator('option')).toHaveCount(1);
  } finally {
    await f.dispose();
  }
});

for (const endpoint of ['discrepancies', 'discrepancy-registers'])
  test(`diferențe acces ${endpoint}: refuzul paginii2 elimină rândurile și etichetele opțiunilor`, async ({
    browser,
  }) => {
    const f = await cashDiscrepanciesFixture(browser);
    try {
      const page = await f.login('reporter');
      await smallReportPages(page);
      await page.route(`**/api/tenant/cash-shifts/${endpoint}?**`, async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.has('cursor'))
          return route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Accesul la raport a fost retras',
              code: 'REQUEST_REJECTED',
            }),
          });
        url.searchParams.set('limit', '1');
        await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
      });
      await navigateSection(page, 'Case');
      await enterDiscrepancyDates(page, f.date);
      const report = discrepancySection(page);
      await expect(report.getByRole('article')).toHaveCount(1);
      await expect(
        report.getByLabel('Casa din raport', { exact: true }).locator('option'),
      ).toHaveCount(2);
      await report
        .getByRole('button', {
          name: endpoint === 'discrepancies' ? 'Mai multe închideri' : 'Mai multe case istorice',
          exact: true,
        })
        .click();
      await expect(report.getByRole('article')).toHaveCount(0);
      await expect(
        report.getByLabel('Casa din raport', { exact: true }).locator('option'),
      ).toHaveCount(1);
      await expect(
        report.getByRole('button', { name: 'Mai multe închideri', exact: true }),
      ).toHaveCount(0);
    } finally {
      await f.dispose();
    }
  });
