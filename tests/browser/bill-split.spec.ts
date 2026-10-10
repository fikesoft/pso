import { test, expect } from '@playwright/test';
import { completePacking } from './support/complete-packing';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';
test('notă împărțită: creare mobilă, încasare pe două comenzi și recuperare după răspuns pierdut', async ({
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
    for (let i = 0; i < 2; i++) {
      const { order } = await post('/orders', {
        locationId: f.location.id,
        requestKey: crypto.randomUUID(),
        source: 'WAITER',
        serviceType: 'DINE_IN',
        tableVisitId: event.visitId,
        items: [{ productId: product.id, quantity: '1' }],
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
    await panel.getByLabel('Număr de părți', { exact: true }).fill('3');
    await panel.getByRole('button', { name: 'Previzualizează împărțirea', exact: true }).click();
    await expect(panel.getByText('20.02 MDL', { exact: true })).toBeVisible();
    await panel
      .getByRole('checkbox', { name: 'Confirm comenzile și sumele afișate.', exact: true })
      .check();
    let { split } = await submit(
      page,
      '/api/tenant/bill-splits',
      panel.getByRole('button', { name: 'Confirmă împărțirea', exact: true }),
    );
    await expect(
      panel.getByRole('heading', { name: 'Partea 2: 6.67 MDL', exact: true }),
    ).toBeVisible();
    await panel.getByLabel('Motivul anulării', { exact: true }).fill('Refacere cu sume explicite');
    await panel
      .getByRole('checkbox', { name: 'Confirm anularea acestui plan.', exact: true })
      .check();
    await submit(
      page,
      `/api/tenant/bill-splits/${split.id}/void`,
      panel.getByRole('button', { name: 'Anulează împărțirea', exact: true }),
    );
    await panel.getByRole('button', { name: 'Împarte comenzile neincluse', exact: true }).click();
    await panel.getByLabel('Mod de împărțire', { exact: true }).selectOption('CUSTOM');
    await panel
      .getByLabel('Sumele părților, separate prin punct și virgulă', { exact: true })
      .fill('6.68;6.67;6.67');
    await panel.getByRole('button', { name: 'Previzualizează împărțirea', exact: true }).click();
    await panel
      .getByRole('checkbox', { name: 'Confirm comenzile și sumele afișate.', exact: true })
      .check();
    await page.route(
      '**/api/tenant/bill-splits',
      async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        split = (await response.json()).split;
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
    await expect(
      panel.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }),
    ).not.toBeVisible();
    await panel.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }).click();
    await page.getByRole('button', { name: 'Deschide contextul mesei', exact: true }).click();
    await page.getByRole('button', { name: 'Nota și împărțirea', exact: true }).click();
    await panel
      .locator(`[data-bill-id="${split.id}"]`)
      .getByRole('button', { name: 'Deschide planul', exact: true })
      .click();
    await panel.getByRole('button', { name: 'Încasează partea 2', exact: true }).click();
    await panel.getByLabel('Tura proprie pentru operație', { exact: true }).selectOption(shift.id);
    await panel.getByLabel('Numerar primit', { exact: true }).fill('10.00');
    await panel
      .getByRole('checkbox', { name: 'Confirm încasarea întregului sold afișat.', exact: true })
      .check();
    let collectionId = '';
    await page.route(
      `**/api/tenant/bill-parts/${split.parts[1].id}/payments`,
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        collectionId = (await response.json()).collection.id;
        await route.abort('failed');
      },
      { times: 1 },
    );
    await panel.getByRole('button', { name: 'Confirmă încasarea', exact: true }).click();
    await expect(
      panel.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Înapoi la servire', exact: true }),
    ).toBeDisabled();
    await noOverflow(page);
    await panel.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }).click();
    await expect(
      panel.getByRole('button', { name: 'Încasează partea 2', exact: true }),
    ).not.toBeVisible();
    const result = await api(page, `/bill-splits/${split.id}?locationId=${f.location.id}`);
    expect((await result.json()).split.parts[1].outstandingAmount).toBe('0.00');
    expect(collectionId).toBeTruthy();
    await expect(
      panel.getByRole('button', { name: 'Înapoi la servire', exact: true }),
    ).toBeEnabled();
    await expect(
      panel.getByRole('heading', { name: 'Partea 2: 6.67 MDL', exact: true }),
    ).toBeVisible();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`bill-${width}.png`), fullPage: true });
    }
    for (const position of [1, 3]) {
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
      await submit(
        page,
        `/api/tenant/bill-parts/${split.parts[position - 1].id}/payments`,
        panel.getByRole('button', { name: 'Confirmă încasarea', exact: true }),
      );
      await expect(
        panel.getByRole('button', { name: 'Înapoi la servire', exact: true }),
      ).toBeEnabled();
    }
    for (const source of split.sources) {
      const response = await api(page, `/orders/${source.orderId}`),
        current = (await response.json()).order;
      expect(current.paymentSummary.netPaidAmount).toBe('10.01');
      expect(current).toMatchObject({ status: 'IN_PROGRESS', packingStatus: 'WAITING' });
      const packed = await completePacking(page, source.orderId);
      await post(`/orders/${source.orderId}/complete`, {
        version: packed.version,
        requestKey: crypto.randomUUID(),
      });
    }
    await panel.getByRole('button', { name: 'Înapoi la servire', exact: true }).click();
    await page.getByRole('button', { name: 'Reîncarcă vizita', exact: true }).first().click();
    await page
      .getByLabel('Motivul operației de vizită', { exact: true })
      .fill('Nota împărțită a fost achitată integral');
    const closed = await submit(
      page,
      `/api/tenant/table-visits/${event.visitId}/commands`,
      page.getByRole('button', { name: 'Închide vizita', exact: true }),
    );
    expect(closed.event.result.status).toBe('CLOSED');
  } finally {
    await f.dispose();
  }
});
