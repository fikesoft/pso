import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import type { CatalogResponse } from '../../packages/contracts/src';
import { operatorFixture } from './operator-setup';
import { api } from './support/browser-helpers';

export async function operatorSearchFixture(browser: Browser) {
  const f = await operatorFixture(browser, false);
  try {
    const seeded = [];
    for (let index = 0; index < 55; index++) {
      const suffix = String(index).padStart(3, '0');
      const response = await api(f.admin, '/catalog/products', {
        locationId: f.location.id,
        categoryId: f.drinks.id,
        name: `Șnițel căutare 100%_\\literal-${suffix}`,
        sku: `NEEDLE-${suffix}`,
        price: '3.00',
      });
      expect(response.status()).toBe(200);
      seeded.push((await response.json()).product);
    }
    const first = (await (
      await api(f.admin, `/catalog?locationId=${f.location.id}`)
    ).json()) as CatalogResponse;
    expect(first.products).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();
    const next = (await (
      await api(
        f.admin,
        `/catalog?locationId=${f.location.id}&cursor=${encodeURIComponent(first.nextCursor!)}`,
      )
    ).json()) as CatalogResponse;
    const ids = new Set(seeded.map((product) => product.id));
    const target = next.products.find((product) => ids.has(product.id));
    expect(target).toBeDefined();
    return { ...f, target: target! };
  } catch (error) {
    await f.dispose();
    throw error;
  }
}

export async function catalogRequest(
  page: Page,
  expected: Record<string, string>,
  action: () => Promise<unknown>,
  nextPage = false,
) {
  const pending = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/tenant/catalog' &&
      response.request().method() === 'GET' &&
      Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value) &&
      url.searchParams.has('cursor') === nextPage
    );
  });
  await action();
  const response = await pending;
  expect(response.status()).toBe(200);
  return response.json() as Promise<CatalogResponse>;
}
