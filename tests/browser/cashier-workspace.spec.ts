import { test, expect } from '@playwright/test';
import { cashierFixture } from './cashier-setup';
import { navigateSection, noOverflow, submit } from './support/browser-helpers';

test('casier: ciorna și panoul mobil se păstrează la schimbarea legitimă Operator ↔ Casier', async ({
  browser,
}, info) => {
  const f = await cashierFixture(browser);
  try {
    const { page } = await f.login('operator');
    await navigateSection(page, 'Operator');
    await page
      .getByRole('region', { name: 'Catalog operator', exact: true })
      .getByRole('button', { name: /Produs casier/ })
      .click();
    const draft = page.getByRole('region', { name: 'Comanda curentă', exact: true });
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await draft.getByLabel('Numele clientului', { exact: true }).fill('Client ciornă casier');
    await draft.getByLabel('Cantitate', { exact: true }).fill('2');
    await draft.getByLabel('Observații comandă', { exact: true }).fill('Păstrează aceeași ciornă');
    await navigateSection(page, 'Casier');
    const catalog = page.getByRole('region', { name: 'Catalog casier', exact: true });
    const search = catalog.getByLabel('Caută produse', { exact: true });
    await search.fill('Produs');
    const posted = page
      .waitForRequest(
        (request) => request.url().endsWith('/api/tenant/orders') && request.method() === 'POST',
        { timeout: 500 },
      )
      .then(
        () => true,
        () => false,
      );
    await search.focus();
    await page.keyboard.press('Enter');
    expect(await posted).toBe(false);
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('2');
    const save = draft.getByRole('button', { name: 'Salvează ciorna', exact: true });
    await expect(save).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath('cashier-workspace-1440.png'), fullPage: false });
    for (const size of [
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ]) {
      await page.setViewportSize(size);
      await page
        .getByRole('group', { name: 'Casier', exact: true })
        .getByRole('button', { name: /^Comanda curentă/ })
        .click();
      await navigateSection(page, 'Operator');
      await expect(
        page
          .getByRole('group', { name: 'Operator', exact: true })
          .getByRole('button', { name: /^Comanda curentă/ }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue(
        'Client ciornă casier',
      );
      await navigateSection(page, 'Casier');
      await expect(
        page
          .getByRole('group', { name: 'Casier', exact: true })
          .getByRole('button', { name: /^Comanda curentă/ }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('2');
      await expect(draft.getByLabel('Observații comandă', { exact: true })).toHaveValue(
        'Păstrează aceeași ciornă',
      );
      await save.scrollIntoViewIfNeeded();
      await save.focus();
      await expect(save).toBeFocused();
      await expect(save).toBeInViewport({ ratio: 1 });
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`cashier-draft-${size.width}.png`),
        fullPage: false,
      });
    }
    await page.getByRole('link', { name: 'Mergi la comenzile active', exact: true }).click();
    await expect(page.locator('#cashier-active-orders')).toBeFocused();
    await page.getByRole('link', { name: 'Înapoi la editorul comenzii', exact: true }).click();
    await expect(page.locator('#cashier-composer')).toBeFocused();
    const created = await submit(page, '/api/tenant/orders', save);
    expect(created.order).toMatchObject({
      status: 'DRAFT',
      total: '60.00',
      customer: { name: 'Client ciornă casier' },
    });
    expect(created.order.items[0].quantity).toBe('2.000');
    await expect(
      page.getByRole('dialog', { name: `Comanda #${created.order.number}`, exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#cashier-composer').scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport({ ratio: 1 });
    await noOverflow(page);
  } finally {
    await f.dispose();
  }
});

test('casier: creare fără istoric și navigație refuzată cititorului simplu ori finanțelor fără citire', async ({
  browser,
}) => {
  const f = await cashierFixture(browser);
  try {
    const { page, reads } = await f.login('creator');
    await navigateSection(page, 'Casier');
    await expect(page.getByRole('region', { name: 'Comenzi active', exact: true })).toHaveCount(0);
    await page
      .getByRole('region', { name: 'Catalog casier', exact: true })
      .getByRole('button', { name: /Produs casier/ })
      .click();
    const draft = page.getByRole('region', { name: 'Comanda curentă', exact: true });
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    const saved = await submit(
      page,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(saved.order).toMatchObject({ status: 'DRAFT', total: '30.00' });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(reads.filter((path) => /\/orders(?:\/|$)/.test(path))).toEqual([]);
    for (const kind of ['reader', 'blind']) {
      const actor = await f.login(kind);
      await expect(
        actor.page
          .getByRole('navigation', { name: 'Navigație principală' })
          .getByRole('button', { name: 'Casier', exact: true }),
      ).toHaveCount(0);
    }
  } finally {
    await f.dispose();
  }
});
