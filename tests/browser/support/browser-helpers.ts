import { expect } from '@playwright/test';
import type { Browser, BrowserContext, Page, Locator, TestInfo } from '@playwright/test';
import { tenantOrigin, platformOrigin, isLocal, viewports } from './browser.constants';
import { observeRuntimeErrors } from './runtime-errors';
export async function localOnly(context: BrowserContext) {
  observeRuntimeErrors(context);
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('http:') || url.startsWith('https:')) {
      if (!isLocal(url)) {
        await route.abort('blockedbyclient');
        return;
      }
    }
    await route.continue();
  });
}
export async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(size.page, 'Pagina nu trebuie să depășească lățimea viewportului').toBeLessThanOrEqual(
    size.viewport + 1,
  );
}
export async function navigateSection(page: Page, name: string) {
  const toggle = page.getByRole('button', { name: 'Deschide meniul', exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await page
    .getByRole('navigation', { name: 'Navigație principală' })
    .getByRole('button', { name, exact: true })
    .click();
}
export async function submit(page: Page, path: string, button: Locator) {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path && response.request().method() === 'POST',
  );
  await button.click();
  const response = await responsePromise;
  expect([200, 201], `POST ${path} trebuie să reușească`).toContain(response.status());
  return response.json();
}
export async function session(page: Page, plane: 'tenant' | 'platform' = 'tenant') {
  const result = await page.request.get(
    `${plane === 'tenant' ? tenantOrigin : platformOrigin}/api/${plane}/auth/session`,
  );
  expect(result.status()).toBe(200);
  return result.json();
}
export async function api(
  page: Page,
  path: string,
  body?: unknown,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' = body === undefined ? 'GET' : 'POST',
) {
  const state = await session(page);
  return page.request.fetch(`${tenantOrigin}/api/tenant${path}`, {
    method,
    headers: { Origin: tenantOrigin, 'X-CSRF-Token': state.csrfToken },
    ...(body === undefined ? {} : { data: body }),
  });
}
export async function isolatedPage(browser: Browser, contexts: BrowserContext[]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  contexts.push(context);
  await localOnly(context);
  return context.newPage();
}
export async function verifyMobileMenuKeyboard(page: Page) {
  const toggle = page.getByRole('button', { name: 'Deschide meniul', exact: true });
  if (!(await toggle.isVisible())) return;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('aside'))).toBe(false);
}
export async function adminViewports(page: Page, info: TestInfo) {
  for (const viewport of viewports.slice(0, 4)) {
    await page.setViewportSize(viewport);
    await navigateSection(page, 'Echipă');
    await expect(page.getByRole('heading', { name: 'Echipă', exact: true })).toBeVisible();
    await noOverflow(page);
    await verifyMobileMenuKeyboard(page);
    await page.getByRole('button', { name: 'Adaugă persoană' }).click();
    const dialog = page.getByRole('dialog', { name: 'Adaugă în echipă' });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
      .toBe(true);
    await page.keyboard.press('Tab');
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
      .toBe(true);
    await noOverflow(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Adaugă persoană' })).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`admin-staff-${viewport.width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
