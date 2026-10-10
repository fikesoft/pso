import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection, noOverflow } from './support/browser-helpers';
test('articole împărțite: cantități fracționare, recuperare după reload și încasare', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser),
    page = f.admin;
  try {
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    const post = async (path: string, body: unknown) => {
      const response = await api(page, path, body);
      expect(response.status()).toBe(200);
      return response.json();
    };
    const { product } = await post('/catalog/products', {
      locationId: f.location.id,
      sku: crypto.randomUUID(),
      name: 'Produs notă sintetică',
      price: '10.01',
    });
    const free = (
      await post('/catalog/products', {
        locationId: f.location.id,
        sku: crypto.randomUUID(),
        name: 'Articol gratuit',
        price: '0',
      })
    ).product;
    const { table } = await post('/dining-tables', {
      locationId: f.location.id,
      requestKey: crypto.randomUUID(),
      code: 'N1',
      name: 'Masă pentru notă',
      capacity: 4,
      sortOrder: 0,
    });
    const { event } = await post(`/dining-tables/${table.id}/visits`, {
      locationId: f.location.id,
      requestKey: crypto.randomUUID(),
      guestCount: 3,
    });
    for (let i = 0; i < 3; i++) {
      const { order } = await post('/orders', {
        locationId: f.location.id,
        requestKey: crypto.randomUUID(),
        source: 'WAITER',
        serviceType: 'DINE_IN',
        tableVisitId: event.visitId,
        items: [{ productId: i === 2 ? free.id : product.id, quantity: '1' }],
      });
      const sent = await post(`/orders/${order.id}/send`, {
        version: order.version,
        requestKey: crypto.randomUUID(),
      });
      let ticket = sent.ticket;
      for (const status of ['PREPARING', 'READY']) {
        const response = await api(
          page,
          `/kitchen/tickets/${ticket.id}`,
          { version: ticket.version, status },
          'PATCH',
        );
        expect(response.status()).toBe(200);
        ticket = (await response.json()).ticket;
      }
    }
    const shift = await f.cashShift();
    await navigateSection(page, 'Mese');
    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByRole('button', { name: 'Deschide contextul mesei', exact: true }).click();
    await page.getByRole('button', { name: 'Nota și împărțirea', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Împărțirea notei', exact: true });
    await panel.getByRole('button', { name: 'Împarte comenzile neincluse', exact: true }).click();
    await panel.getByLabel('Mod de împărțire', { exact: true }).selectOption('ITEMS');
    await panel.getByRole('button', { name: 'Încarcă articolele neincluse', exact: true }).click();
    await panel.getByLabel('Număr de părți', { exact: true }).fill('3');
    const rows = panel.locator('[data-bill-item]');
    await expect(rows).toHaveCount(3);
    for (const row of await rows.all()) {
      for (const [index, quantity] of ['0.300', '0.350', '0.350'].entries())
        await row.getByLabel(`Partea ${index + 1} — cantitate`, { exact: true }).fill(quantity);
    }
    await rows.first().getByLabel('Partea 1 — cantitate', { exact: true }).fill('0.301');
    await panel.getByRole('button', { name: 'Previzualizează împărțirea', exact: true }).click();
    await expect(
      panel.getByText('Cantitățile alocate trebuie să însumeze exact cantitatea articolului.', {
        exact: true,
      }),
    ).toBeVisible();
    await rows.first().getByLabel('Partea 1 — cantitate', { exact: true }).fill('0,300');
    await panel.getByRole('button', { name: 'Previzualizează împărțirea', exact: true }).click();
    await expect(
      panel.getByRole('heading', { name: 'Partea 2: 7.02 MDL', exact: true }),
    ).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('items-form-360.png'), fullPage: true });
    await panel
      .getByRole('checkbox', {
        name: 'Confirm articolele, cantitățile și sumele afișate.',
        exact: true,
      })
      .check();
    let splitId = '';
    await page.route(
      '**/api/tenant/bill-splits',
      async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        const result = await response.json();
        expect(result.split.mode).toBe('ITEMS');
        splitId = result.split.id;
        await route.abort('failed');
      },
      { times: 1 },
    );
    await panel.getByRole('button', { name: 'Confirmă împărțirea', exact: true }).click();
    await expect(
      panel.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Mese');
    await panel.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }).click();
    await page.getByRole('button', { name: 'Deschide contextul mesei', exact: true }).click();
    await page.getByRole('button', { name: 'Nota și împărțirea', exact: true }).click();
    await panel
      .locator(`[data-bill-id="${splitId}"]`)
      .getByRole('button', { name: 'Deschide planul', exact: true })
      .click();
    await expect(
      panel.getByRole('heading', { name: 'Partea 2: 7.02 MDL', exact: true }),
    ).toBeVisible();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`items-plan-${width}.png`), fullPage: true });
    }
    for (const position of [1, 2, 3]) {
      await panel
        .getByRole('button', { name: `Încasează partea ${position}`, exact: true })
        .click();
      await panel
        .getByLabel('Tura proprie pentru operație', { exact: true })
        .selectOption(shift.id);
      await panel.getByLabel('Metodă', { exact: true }).selectOption('CARD');
      await panel
        .getByRole('checkbox', { name: 'Confirm încasarea întregului sold afișat.', exact: true })
        .check();
      await panel.getByRole('button', { name: 'Confirmă încasarea', exact: true }).click();
      await expect(
        panel.getByRole('button', { name: 'Înapoi la servire', exact: true }),
      ).toBeEnabled();
      await expect(
        panel.getByRole('button', { name: `Încasează partea ${position}`, exact: true }),
      ).not.toBeVisible();
    }
    const response = await api(page, `/bill-splits/${splitId}?locationId=${f.location.id}`);
    const { split } = await response.json();
    for (const part of split.parts) expect(part.outstandingAmount).toBe('0.00');
    for (const source of split.sources) {
      const current = (await (await api(page, `/orders/${source.orderId}`)).json()).order;
      expect(current.paymentSummary.netPaidAmount).toBe(
        source.amount === '0.00' ? '0.00' : '10.01',
      );
      expect(current.items[0].quantity).toBe('1.000');
    }
  } finally {
    await f.dispose();
  }
});
