import { test, expect } from '@playwright/test';
import { operatorSearchFixture, catalogRequest } from './operator-search-setup';
import { operatorFixture } from './operator-setup';
import { api, noOverflow, submit } from './support/browser-helpers';

test('căutare produse: operatorul găsește după prima pagină prin SKU, Unicode și caractere literale, cu categorie aplicată pe server', async ({
  browser,
}) => {
  const f = await operatorSearchFixture(browser);
  const { operator, target, location } = f;
  try {
    const catalog = operator.getByRole('region', { name: 'Catalog operator', exact: true });
    const draft = operator.getByRole('region', { name: 'Comanda curentă', exact: true });
    const field = catalog.getByLabel('Caută produse', { exact: true });
    const targetButton = catalog.getByRole('button', {
      name: `${target.name} ${target.price} MDL`,
      exact: true,
    });
    await expect(targetButton).toHaveCount(0);
    for (const query of [
      target.sku.toLowerCase(),
      target.name.toLocaleUpperCase('ro-RO'),
      target.name.slice(target.name.indexOf('100%')),
    ]) {
      const response = await catalogRequest(operator, { locationId: location.id, q: query }, () =>
        field.fill(query),
      );
      expect(response.products.map((product) => product.id)).toEqual([target.id]);
      await expect(targetButton).toBeEnabled();
    }
    const query = await field.inputValue();
    const none = await catalogRequest(operator, { q: query, categoryId: f.snacks.id }, () =>
      catalog.getByRole('button', { name: 'Gustări operator', exact: true }).click(),
    );
    expect(none.products).toHaveLength(0);
    await expect(targetButton).toHaveCount(0);
    const match = await catalogRequest(operator, { q: query, categoryId: f.drinks.id }, () =>
      catalog.getByRole('button', { name: 'Băuturi operator', exact: true }).click(),
    );
    expect(match.products.map((product) => product.id)).toEqual([target.id]);
    await targetButton.click();
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    const created = await submit(
      operator,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(created.order.items).toHaveLength(1);
    expect(created.order.items[0].productId).toBe(target.id);
    expect(created.order.total).toBe('3.00');
  } finally {
    await f.dispose();
  }
});

test('căutare produse: răspunsul vechi nu suprascrie căutarea nouă, iar actualizarea live păstrează paginile și ciorna', async ({
  browser,
}, info) => {
  const f = await operatorSearchFixture(browser);
  const { operator, admin, location } = f;
  let release: (() => void) | undefined;
  try {
    const catalog = operator.getByRole('region', { name: 'Catalog operator', exact: true });
    const draft = operator.getByRole('region', { name: 'Comanda curentă', exact: true });
    const field = catalog.getByLabel('Caută produse', { exact: true });
    await catalogRequest(operator, { q: 'Gustare' }, () => field.fill('Gustare'));
    await catalog.getByRole('button', { name: /Gustare operator/ }).click();
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await draft.getByLabel('Cantitate', { exact: true }).fill('2');
    await draft.getByLabel('Observație produs', { exact: true }).fill('Ciornă păstrată la căutare');
    const first = await catalogRequest(operator, { q: 'Șnițel' }, () => field.fill('Șnițel'));
    expect(first.products).toHaveLength(50);
    await catalogRequest(
      operator,
      { q: 'Șnițel' },
      () =>
        catalog.getByRole('button', { name: 'Încarcă mai multe · Catalog', exact: true }).click(),
      true,
    );
    const matches = catalog.getByRole('button', { name: /Șnițel/ });
    await expect(matches).toHaveCount(55);
    const added = await api(admin, '/catalog/products', {
      locationId: location.id,
      categoryId: f.drinks.id,
      name: 'Șnițel nou live',
      sku: 'LIVE-NEEDLE',
      price: '4',
    });
    expect(added.status()).toBe(200);
    await expect(matches).toHaveCount(56);
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('2');
    let captured!: () => void;
    let completed!: () => void;
    const held = new Promise<void>((resolve) => {
      captured = resolve;
    });
    const done = new Promise<void>((resolve) => {
      completed = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await operator.route('**/api/tenant/catalog?*', async (route) => {
      if (new URL(route.request().url()).searchParams.get('q') !== 'Cafea') return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      captured();
      await gate;
      await route.fulfill({ response });
      completed();
    });
    await field.fill('Cafea');
    await held;
    const stale = catalog.getByRole('button', { name: /Șnițel/ });
    for (const button of await stale.all()) await expect(button).toBeDisabled();
    await catalogRequest(operator, { q: 'Gustare' }, () => field.fill('Gustare'));
    await expect(catalog.getByRole('button', { name: /Gustare operator/ })).toBeEnabled();
    release!();
    await done;
    await expect(catalog.getByRole('button', { name: /Cafea operator/ })).toHaveCount(0);
    await expect(catalog.getByRole('button', { name: /Șnițel/ })).toHaveCount(0);
    await expect(field).toHaveValue('Gustare');
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('2');
    await expect(draft.getByLabel('Observație produs', { exact: true })).toHaveValue(
      'Ciornă păstrată la căutare',
    );
    await noOverflow(operator);
    await operator.screenshot({
      path: info.outputPath('operator-search-1440.png'),
      fullPage: false,
    });
  } finally {
    release?.();
    await f.dispose();
  }
});

test('căutare produse: eroarea oprește încărcarea, iar refuzul accesului golește catalogul fără revenire din răspunsul vechi', async ({
  browser,
}) => {
  const f = await operatorFixture(browser, false);
  const { operator } = f;
  let release: (() => void) | undefined;
  try {
    const catalog = operator.getByRole('region', { name: 'Catalog operator', exact: true });
    const draft = operator.getByRole('region', { name: 'Comanda curentă', exact: true });
    const field = catalog.getByLabel('Caută produse', { exact: true });
    const snack = catalog.getByRole('button', { name: /Gustare operator/ });
    await catalogRequest(operator, { q: 'Gustare' }, () => field.fill('Gustare'));
    await snack.click();
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await draft.getByLabel('Cantitate', { exact: true }).fill('2');
    let transient = true;
    let captured!: () => void;
    let completed!: () => void;
    const held = new Promise<void>((resolve) => {
      captured = resolve;
    });
    const done = new Promise<void>((resolve) => {
      completed = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await operator.route('**/api/tenant/catalog?*', async (route) => {
      const query = new URL(route.request().url()).searchParams.get('q');
      if (query === 'Cafea') {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        captured();
        await gate;
        await route.fulfill({ response });
        completed();
      } else if (query === 'Retras' || (query === 'Gustare' && transient)) {
        await route.fulfill({
          status: query === 'Retras' ? 403 : 503,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'REQUEST_REJECTED',
            error: query === 'Retras' ? 'Acces catalog retras' : 'Catalog temporar indisponibil',
          }),
        });
      } else await route.continue();
    });
    await operator.getByRole('button', { name: 'Reîncarcă · Catalog', exact: true }).click();
    await expect(catalog.getByRole('alert')).toContainText('Catalog temporar indisponibil');
    await expect(catalog.getByText('Se încarcă datele…', { exact: true })).toHaveCount(0);
    await expect(snack).toBeDisabled();
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('2');
    transient = false;
    await catalogRequest(operator, { q: 'Gustare' }, () =>
      catalog.getByRole('button', { name: 'Reîncarcă · Catalog', exact: true }).click(),
    );
    await expect(snack).toBeEnabled();
    await field.fill('Cafea');
    await held;
    await expect(catalog.getByText('Se încarcă datele…', { exact: true })).toBeVisible();
    await field.fill('Retras');
    await expect(catalog.getByRole('alert')).toContainText('Acces catalog retras');
    await expect(catalog.getByText('Se încarcă datele…', { exact: true })).toHaveCount(0);
    await expect(
      catalog.getByRole('button', { name: 'Băuturi operator', exact: true }),
    ).toHaveCount(0);
    await expect(
      catalog.getByRole('button', { name: 'Gustări operator', exact: true }),
    ).toHaveCount(0);
    await expect(snack).toHaveCount(0);
    release!();
    await done;
    await expect(catalog.getByRole('button', { name: /Cafea operator/ })).toHaveCount(0);
    await expect(
      catalog.getByRole('button', { name: 'Băuturi operator', exact: true }),
    ).toHaveCount(0);
    await expect(field).toHaveValue('Retras');
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('2');
  } finally {
    release?.();
    await f.dispose();
  }
});
