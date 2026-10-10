import { completePacking } from './support/complete-packing';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';
test('mese: configurare → vizită → comandă mobilă → bucătărie → plată → închidere', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser);
  const page = f.admin;
  try {
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await createOperationalProduct(page);
    await navigateSection(page, 'Mese');
    await page.getByRole('button', { name: 'Configurarea meselor', exact: true }).click();
    await page.getByRole('button', { name: 'Creează masa', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Creează masa', exact: true });
    await form.getByLabel('Codul mesei', { exact: true }).fill('t1');
    await form.getByLabel('Denumirea mesei', { exact: true }).fill('Terasa');
    const { table } = await submit(
      page,
      '/api/tenant/dining-tables',
      form.getByRole('button', { name: 'Salvează masa', exact: true }),
    );
    await expect(form).not.toBeVisible();
    await page.getByRole('button', { name: 'Editează masa', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Editează masa', exact: true });
    await edit.getByLabel('Denumirea mesei', { exact: true }).fill('Terasa actualizată');
    const updateUrl = `**/api/tenant/dining-tables/${table.id}`;
    let committedVersion = 0;
    let originalBody = '';
    await page.route(
      updateUrl,
      async (route) => {
        originalBody = route.request().postData()!;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        committedVersion = (await response.json()).table.version;
        await route.abort('failed');
      },
      { times: 1 },
    );
    await edit.getByRole('button', { name: 'Salvează masa', exact: true }).click();
    const retry = edit.getByRole('button', { name: 'Reîncearcă exact operația', exact: true });
    await expect(retry).toBeVisible();
    await expect(edit.getByLabel('Denumirea mesei', { exact: true })).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Înapoi la hartă', exact: true, includeHidden: true }),
    ).toBeDisabled();
    const replayPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/tenant/dining-tables/${table.id}` &&
        response.request().method() === 'PATCH',
    );
    await retry.click();
    const replay = await replayPromise;
    expect(replay.status()).toBe(200);
    expect(replay.request().postData()).toBe(originalBody);
    expect((await replay.json()).table.version).toBe(committedVersion);
    await expect(edit).not.toBeVisible();
    await page.getByRole('button', { name: 'Înapoi la hartă', exact: true }).click();
    await page.getByRole('button', { name: 'Deschide vizita', exact: true }).click();
    await page.getByLabel('Număr de persoane', { exact: true }).fill('3');
    const opened = await submit(
      page,
      `/api/tenant/dining-tables/${table.id}/visits`,
      page.getByRole('button', { name: 'Deschide vizita', exact: true }),
    );
    const visitId = opened.event.visitId;
    await expect(page.getByRole('heading', { name: /Vizita mesei: T1/ })).toBeVisible();
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`visit-${viewport.width}.png`),
        fullPage: true,
      });
    }
    await page.getByRole('button', { name: 'Comandă nouă la masă', exact: true }).click();
    await expect(page.getByLabel('Masa', { exact: true })).toHaveValue('T1');
    await expect(page.getByLabel('Masa', { exact: true })).toHaveAttribute('readonly', '');
    await page.getByRole('button', { name: /Cafea sintetică.*10/ }).click();
    await page.getByRole('button', { name: /Comanda curentă/ }).click();
    await noOverflow(page);
    const { order } = await submit(
      page,
      '/api/tenant/orders',
      page.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(order.tableVisitId).toBe(visitId);
    const detail = page.getByRole('dialog', { name: `Comanda #${order.number}`, exact: true });
    await expect(detail).toBeVisible();
    const sent = await submit(
      page,
      `/api/tenant/orders/${order.id}/send`,
      detail.getByRole('button', { name: 'Trimite la bucătărie', exact: true }),
    );
    await page.keyboard.press('Escape');
    let ticket = sent.ticket;
    for (const status of ['PREPARING', 'READY']) {
      const result = await api(
        page,
        `/kitchen/tickets/${ticket.id}`,
        { version: ticket.version, status },
        'PATCH',
      );
      expect(result.status()).toBe(200);
      ticket = (await result.json()).ticket;
    }
    await completePacking(page, order.id);
    await page.getByRole('button', { name: 'Reîncarcă vizita', exact: true }).first().click();
    await expect(page.getByText('Preparate gata', { exact: true }).first()).toBeVisible();
    await submit(
      page,
      `/api/tenant/table-visits/${visitId}/commands`,
      page.getByRole('button', { name: 'Cere nota', exact: true }),
    );
    const targetResponse = await api(page, '/dining-tables', {
      locationId: f.location.id,
      requestKey: crypto.randomUUID(),
      code: 'T2',
      name: 'Terasa nouă',
      capacity: 4,
      sortOrder: 20,
    });
    expect(targetResponse.status()).toBe(200);
    const target = (await targetResponse.json()).table;
    await page.locator('summary').filter({ hasText: 'Mută vizita' }).click();
    const move = page
      .locator('details')
      .filter({ has: page.getByLabel('Masa destinație', { exact: true }) });
    await move.getByRole('button', { name: 'Reîncarcă mesele', exact: true }).click();
    await move.getByLabel('Masa destinație', { exact: true }).selectOption(target.id);
    await move.getByLabel('Motivul mutării', { exact: true }).fill('Clienții aleg terasa nouă');
    await move
      .getByRole('checkbox', {
        name: 'Confirm mutarea vizitei și a servirii la masa selectată',
        exact: true,
      })
      .check();
    await noOverflow(page);
    const moved = await submit(
      page,
      `/api/tenant/table-visits/${visitId}/commands`,
      move.getByRole('button', { name: 'Mută vizita', exact: true }),
    );
    expect(moved.event.result).toMatchObject({
      id: visitId,
      tableId: target.id,
      billRequested: true,
    });
    await expect(page.getByRole('heading', { name: /Vizita mesei: T2/ })).toBeVisible();
    await expect(page.getByText('Vizită mutată', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('visit-moved-360.png'), fullPage: true });
    const mergeTableResponse = await api(page, '/dining-tables', {
      locationId: f.location.id,
      requestKey: crypto.randomUUID(),
      code: 'T3',
      name: 'Masa comună',
      capacity: 8,
      sortOrder: 30,
    });
    expect(mergeTableResponse.status()).toBe(200);
    const mergeTable = (await mergeTableResponse.json()).table;
    const mergeVisitResponse = await api(page, `/dining-tables/${mergeTable.id}/visits`, {
      locationId: f.location.id,
      requestKey: crypto.randomUUID(),
      guestCount: 2,
    });
    expect(mergeVisitResponse.status()).toBe(200);
    const mergedVisitId = (await mergeVisitResponse.json()).event.visitId;
    await page.locator('summary').filter({ hasText: 'Unește vizitele' }).click();
    const merge = page
      .locator('details')
      .filter({ has: page.getByLabel('Vizita destinație', { exact: true }) });
    await merge.getByRole('button', { name: 'Reîncarcă mesele', exact: true }).click();
    await merge.getByLabel('Vizita destinație', { exact: true }).selectOption(mergedVisitId);
    await merge
      .getByLabel('Motivul unirii', { exact: true })
      .fill('Clienții se reunesc la masa comună');
    await merge
      .getByRole('checkbox', {
        name: 'Confirm unirea la masa selectată și eliberarea mesei sursă',
        exact: true,
      })
      .check();
    await noOverflow(page);
    const merged = await submit(
      page,
      `/api/tenant/table-visits/${visitId}/commands`,
      merge.getByRole('button', { name: 'Unește vizitele', exact: true }),
    );
    expect(merged.event.result).toMatchObject({
      status: 'MERGED',
      mergedIntoVisitId: mergedVisitId,
    });
    await page.getByRole('button', { name: 'Deschide vizita destinație', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Vizita mesei: T3/ })).toBeVisible();
    await expect(page.getByLabel('Număr de persoane', { exact: true })).toHaveValue('5');
    await expect(page.getByText('Vizită preluată prin unire', { exact: true })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('visit-merged-360.png'), fullPage: true });
    const shift = await f.cashShift();
    await page.getByRole('button', { name: 'Detaliile comenzii', exact: true }).click();
    await detail.getByRole('button', { name: 'Checkout real', exact: true }).click();
    const checkout = page.getByRole('dialog', { name: 'Checkout real', exact: true });
    await checkout.getByRole('button', { name: 'Reîncarcă turele', exact: true }).click();
    await checkout
      .getByLabel('Tura proprie pentru operație', { exact: true })
      .selectOption(shift.id);
    await checkout.getByLabel('Numerar primit (MDL)').fill('20');
    await checkout.getByRole('checkbox', { name: 'Confirm că plata a fost deja primită' }).check();
    await submit(
      page,
      `/api/tenant/orders/${order.id}/checkout/manual`,
      checkout.getByRole('button', { name: 'Înregistrează încasarea', exact: true }),
    );
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Reîncarcă vizita', exact: true }).first().click();
    await page
      .getByLabel('Motivul operației de vizită', { exact: true })
      .fill('Clienții au achitat și au plecat');
    const closed = await submit(
      page,
      `/api/tenant/table-visits/${mergedVisitId}/commands`,
      page.getByRole('button', { name: 'Închide vizita', exact: true }),
    );
    expect(closed.event.result.status).toBe('CLOSED');
    await expect(page.getByText('Vizită închisă', { exact: true }).first()).toBeVisible();
    await noOverflow(page);
  } finally {
    await f.dispose();
  }
});
