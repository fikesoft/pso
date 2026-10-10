import { test, expect } from '@playwright/test';
import { customerAnalyticsFixture } from './customer-analytics-setup';
import { navigateSection, noOverflow } from './support/browser-helpers';

test('analiză CRM: valori reale, acoperire, recalculare și responsive', async ({
  browser,
}, info) => {
  const f = await customerAnalyticsFixture(browser);
  const page = f.admin;
  try {
    await navigateSection(page, 'Clienți');
    await page.getByRole('button', { name: 'Deschide profilul', exact: true }).click();
    const report = page.getByRole('region', { name: 'Analiza clientului', exact: true });
    const value = (label: string) =>
      report
        .locator('dl > div')
        .filter({ has: page.locator('dt').getByText(label, { exact: true }) })
        .locator('dd');
    const rfm = report.getByRole('region', { name: 'Segmentare RFM', exact: true });
    await expect(rfm.getByText('Nou', { exact: true })).toBeVisible();
    await expect(rfm.getByText('5 / 1 / 1', { exact: true })).toBeVisible();
    await expect(value('Comenzi finalizate')).toHaveText('1');
    await expect(value('Valoarea comenzilor')).toHaveText('10.01 MDL');
    await expect(value('Încasat')).toHaveText('7.00 MDL');
    await expect(value('Rambursat')).toHaveText('2.00 MDL');
    await expect(value('Cheltuit net')).toHaveText('5.00 MDL');
    await expect(value('Interval mediu între comenzi (zile)')).toHaveText('Fără date suficiente');
    await expect(
      report.getByText('Cafea sintetică · Cantitate: 1.000 · 1 comandă', { exact: true }),
    ).toBeVisible();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await rfm.scrollIntoViewIfNeeded();
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`customer-rfm-${width}.png`),
        fullPage: true,
      });
    }
    await rfm.getByText('Reguli RFM v1', { exact: true }).click();
    await expect(rfm.getByText('R: 5 pentru', { exact: false })).toBeVisible();
    await noOverflow(page);
    await report.getByLabel('Acoperirea analizei').selectOption('ORGANIZATION');
    await expect(
      report.getByText(`Locații incluse: ${f.location.name}, ${f.otherLocation.name}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(value('Cheltuit net')).toHaveText('5.00 MDL');
    const path = `/api/tenant/customers/${f.customer.id}/analytics`;
    await page.route(`**${path}?**`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Analiză temporar indisponibilă' }),
      }),
    );
    await report.getByRole('button', { name: 'Recalculează analiza', exact: true }).click();
    await expect(report.locator('dl')).toHaveCount(0);
    await expect(report.getByText('Analiză temporar indisponibilă', { exact: true })).toBeVisible();
    await page.unroute(`**${path}?**`);
    await report.getByRole('button', { name: 'Recalculează analiza', exact: true }).click();
    await expect(value('Cheltuit net')).toHaveText('5.00 MDL');
  } finally {
    await f.dispose();
  }
});
