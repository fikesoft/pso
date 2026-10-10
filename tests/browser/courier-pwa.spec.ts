import { test, expect } from '@playwright/test';
import { courierWorkFixture } from './support/courier-work-fixture';
import { navigateSection } from './support/browser-helpers';
test('curier PWA: manifest local, offline fără date cache și fără comenzi în fundal', async ({
  browser,
}) => {
  const f = await courierWorkFixture(browser, 0, 1),
    page = f.admin;
  try {
    await navigateSection(page, 'Livrările mele');
    await expect(
      page.getByText('Adaugă aplicația pe ecranul principal', { exact: true }),
    ).toBeVisible();
    const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestUrl).toBeTruthy();
    const manifest = await (await page.request.get(manifestUrl!)).json();
    expect(manifest).toMatchObject({
      name: 'POS — Livrări',
      display: 'standalone',
      start_url: '/',
      scope: '/',
    });
    expect(manifest.icons[0].src).toBe('/courier-icon.svg');
    const cdp = await page.context().newCDPSession(page);
    expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
    await cdp.detach();
    expect((await page.request.get('/courier-icon.svg')).ok()).toBe(true);
    const workerResponse = await page.request.get('/courier-sw.js');
    expect(workerResponse.headers()['cache-control']).toContain('no-store');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          }),
        );
    });
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') requests.push(request.url());
    });
    await page.getByRole('button', { name: 'Detalii livrare', exact: true }).click();
    const accept = page.getByRole('button', { name: 'Acceptă livrarea', exact: true });
    await expect(accept).toBeEnabled();
    await page.context().setOffline(true);
    await expect(accept).toBeDisabled();
    await expect(page.getByText(/^Ești offline\. Datele afișate/)).toBeVisible();
    const target = page.url();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Conexiunea nu este disponibilă', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Client livrare sintetic', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => caches.keys())).toEqual([]);
    expect(requests).toEqual([]);
    await page.context().setOffline(false);
    await page.goto(target);
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Livrările mele');
    await page.getByRole('button', { name: 'Detalii livrare', exact: true }).click();
    await expect(accept).toBeEnabled();
    expect(requests.filter((url) => url.includes('/accept'))).toEqual([]);
  } finally {
    await page.context().setOffline(false);
    await f.dispose();
  }
});
