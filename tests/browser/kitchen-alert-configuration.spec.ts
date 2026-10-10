import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { orderRealtimeFixture } from './order-realtime-setup';
import { api, navigateSection, noOverflow } from './support/browser-helpers';

test('configurare alerte: scope-uri, ținte, moștenire, recuperare după reload și conflict', async ({
  browser,
}, info) => {
  const f = await orderRealtimeFixture(browser, 'kitchen');
  const page = f.admin;
  try {
    await expect(
      f.operator.getByRole('button', { name: 'Praguri de alertă', exact: true }),
    ).toHaveCount(0);
    const stationResponse = await api(page, '/kitchen-stations', {
      locationId: f.location.id,
      requestKey: randomUUID(),
      code: 'BAR',
      name: 'Bar sintetic',
      sortOrder: 1,
    });
    expect(stationResponse.status()).toBe(200);
    const { station } = await stationResponse.json();
    const open = async () => {
      await page
        .getByRole('combobox', { name: 'Context', exact: true })
        .selectOption(f.location.id);
      await navigateSection(page, 'Bucătărie');
      await page.getByRole('button', { name: 'Praguri de alertă', exact: true }).click();
    };
    await open();
    const panel = page.getByRole('region', { name: 'Praguri de alertă', exact: true });
    const warning = panel.getByLabel('Avertizare după (secunde)', { exact: true });
    const critical = panel.getByLabel('Critic după (secunde)', { exact: true });
    const save = panel.getByRole('button', { name: 'Salvează pragurile', exact: true });
    const fill = async (a: number, b: number) => {
      await expect(warning).toBeEnabled();
      await warning.fill(String(a));
      await critical.fill(String(b));
    };
    const saveValues = async (a: number, b: number) => {
      await fill(a, b);
      const result = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/tenant/kitchen-alerts') &&
          response.request().method() === 'PUT',
      );
      await save.click();
      expect((await result).status()).toBe(200);
      await expect(warning).toBeEnabled();
      await expect(warning).toHaveValue(String(a));
    };
    await panel.getByLabel('Aplică regula pentru', { exact: true }).selectOption('ORGANIZATION');
    await saveValues(100, 200);
    await panel.getByLabel('Aplică regula pentru', { exact: true }).selectOption('LOCATION');
    await expect(warning).toHaveValue('100');
    await fill(45, 90);
    await page.route('**/api/tenant/kitchen-alerts', (route) => route.abort('failed'), {
      times: 1,
    });
    await save.click();
    await panel.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }).click();
    await expect(
      panel.getByText('Tentativa a fost retrasă definitiv. Poți începe explicit o operație nouă.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(warning).toHaveValue('100');
    await saveValues(50, 100);
    await panel.getByLabel('Nivelul regulii', { exact: true }).selectOption('STATION');
    await panel.getByLabel('Selectează ținta regulii', { exact: true }).selectOption(station.id);
    await saveValues(20, 40);
    await panel.getByLabel('Nivelul regulii', { exact: true }).selectOption('CATEGORY');
    await panel
      .getByLabel('Selectează ținta regulii', { exact: true })
      .selectOption({ label: 'Băuturi sintetice' });
    await saveValues(40, 80);
    await panel.getByLabel('Nivelul regulii', { exact: true }).selectOption('PRODUCT');
    await panel.getByLabel('Caută ținta regulii', { exact: true }).fill('CAFEA-E2E');
    await panel.getByLabel('Selectează ținta regulii', { exact: true }).selectOption(f.product.id);
    await expect(warning).toHaveValue('40');
    await saveValues(30, 60);
    await expect(panel.getByText(/La retragerea acestei reguli: 40 \/ 80 s/)).toBeVisible();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`alert-configuration-${width}.png`),
        fullPage: true,
      });
    }
    await panel.getByLabel('Nivelul regulii', { exact: true }).selectOption('DEFAULT');
    await fill(60, 120);
    await page.route(
      '**/api/tenant/kitchen-alerts',
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort('failed');
      },
      { times: 1 },
    );
    await save.click();
    await expect(
      panel.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    ).toBeVisible();
    await expect(warning).toBeDisabled();
    await page.reload();
    await open();
    await expect(
      panel.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }),
    ).toHaveCount(0);
    await panel.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }).click();
    await expect(warning).toBeEnabled();
    await expect(warning).toHaveValue('60');
    const conflict = await api(
      page,
      '/kitchen-alerts',
      {
        scope: { scopeType: 'LOCATION', locationId: f.location.id },
        target: { kind: 'DEFAULT' },
        version: 2,
        requestKey: randomUUID(),
        thresholds: { warningSeconds: 65, criticalSeconds: 130 },
      },
      'PUT',
    );
    expect(conflict.status()).toBe(200);
    await fill(70, 140);
    await save.click();
    await expect(
      panel.getByText('Pragurile au fost modificate. Reîncărcați.', { exact: true }),
    ).toBeVisible();
    await expect(save).toBeDisabled();
    await panel.getByRole('button', { name: 'Reîncarcă regula', exact: true }).click();
    await expect(warning).toHaveValue('65');
    await panel.getByRole('button', { name: 'Folosește regula moștenită', exact: true }).click();
    await expect(warning).toHaveValue('100');
  } finally {
    await f.dispose();
  }
});
