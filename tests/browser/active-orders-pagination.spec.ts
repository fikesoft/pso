import { test, expect } from '@playwright/test';
import { activeOrdersFixture } from './active-orders-setup';
import { navigateSection } from './support/browser-helpers';

test('comenzi active: paginarea păstrează profunzimea la actualizare live, reîncearcă pagina eșuată și șterge datele la 403', async ({
  browser,
}) => {
  const f = await activeOrdersFixture(browser);
  let release: (() => void) | undefined;
  try {
    for (let i = 0; i < 101; i++) await f.create();
    const { operator, panel } = f;
    const cards = panel.getByTestId('active-order-card');
    await expect(cards).toHaveCount(50);
    const more = panel.getByRole('button', { name: 'Mai multe comenzi active', exact: true });
    let held = false;
    let finished!: () => void;
    const done = new Promise<void>((resolve) => {
      finished = resolve;
    });
    let laterPages = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await operator.route('**/api/tenant/orders/active?*', async (route) => {
      if (!new URL(route.request().url()).searchParams.has('cursor')) return route.continue();
      if (!held) {
        held = true;
        const response = await route.fetch();
        await gate;
        await route.fulfill({ response });
        finished();
      } else {
        laterPages++;
        await route.continue();
      }
    });
    await more.click();
    await expect.poll(() => held).toBe(true);
    const newest = await f.create();
    await expect.poll(() => laterPages).toBeGreaterThan(0);
    await expect(cards).toHaveCount(100);
    await expect(
      panel.getByRole('heading', { name: `Comanda #${newest.number}`, exact: true }),
    ).toBeVisible();
    release?.();
    await done;
    await operator.unroute('**/api/tenant/orders/active?*');
    const headings = await cards.getByRole('heading').allTextContents();
    expect(new Set(headings).size).toBe(100);
    await operator.reload();
    await operator
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.location.id);
    await navigateSection(operator, 'Operator');
    await expect(cards).toHaveCount(50);
    let fail = true;
    await operator.route('**/api/tenant/orders/active?*', async (route) => {
      if (fail && new URL(route.request().url()).searchParams.has('cursor')) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Pagina activă indisponibilă temporar' }),
        });
      } else await route.continue();
    });
    await more.click();
    await expect(panel.getByRole('alert')).toContainText('Pagina activă indisponibilă temporar');
    await expect(cards).toHaveCount(50);
    await expect(more).toBeEnabled();
    fail = false;
    await more.click();
    await expect(cards).toHaveCount(100);
    await expect(more).toBeEnabled();
    await operator.unroute('**/api/tenant/orders/active?*');
    await operator.route('**/api/tenant/orders/active?*', async (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Accesul curent la comenzile active a fost retras' }),
      }),
    );
    await panel.getByRole('button', { name: 'Reîncarcă comenzile active', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText(
      'Accesul curent la comenzile active a fost retras',
    );
    await expect(cards).toHaveCount(0);
    await expect(more).toHaveCount(0);
  } finally {
    release?.();
    await f.dispose();
  }
});
