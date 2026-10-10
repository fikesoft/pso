import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection } from './support/browser-helpers';

export async function cashRegisterFixture(browser: Browser) {
  const f = await operationsFixture(browser);
  await f.admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
  const create = async (code: string, name = `Casa ${code}`, locationId = f.location.id) => {
    const response = await api(f.admin, '/cash-registers', {
      locationId,
      code,
      name,
      requestKey: randomUUID(),
    });
    expect(response.status()).toBe(200);
    return (await response.json()).register;
  };
  const refresh = async () => {
    await f.admin.reload();
    await f.admin
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.location.id);
    await navigateSection(f.admin, 'Case');
  };
  return { ...f, create, refresh };
}

export function registerCard(page: Page, name: string) {
  return page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}

export async function newRegisterForm(page: Page, code: string, name: string) {
  await page.getByRole('button', { name: 'Adaugă casă', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Adaugă casă', exact: true });
  await form.getByLabel('Codul casei', { exact: true }).fill(code);
  await form.getByLabel('Denumirea casei', { exact: true }).fill(name);
  return form;
}

export async function registerPointers(page: Page) {
  return page.evaluate(() =>
    Object.entries(sessionStorage)
      .filter(([key]) => key.startsWith('pos.cash-register:'))
      .map(([key, value]) => ({ key, value: JSON.parse(value) })),
  );
}
