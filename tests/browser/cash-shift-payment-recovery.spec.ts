import { test, expect } from '@playwright/test';
import { cashPointers, cashShiftsFixture } from './cash-shifts-setup';
import { openCashierOrder } from './cashier-setup';
import { api, navigateSection, submit } from './support/browser-helpers';

test('ture recovery financiar: plata comisă se rezolvă după reload și închiderea turei originale', async ({
  browser,
}) => {
  const f = await cashShiftsFixture(browser);
  try {
    const page = await f.login();
    const { shift } = await f.open(page, '0');
    const order = await f.order();
    const detail = await openCashierOrder(page, order.number);
    const panel = detail.getByRole('region', { name: 'Plăți și rambursări', exact: true });
    await panel.getByRole('button', { name: 'Încasează o tranșă', exact: true }).click();
    await panel.getByLabel('Tura proprie pentru operație', { exact: true }).selectOption(shift.id);
    await panel.getByLabel('Metoda tranșei', { exact: true }).selectOption('CARD');
    await panel.getByLabel('Tranșă card (MDL)', { exact: true }).fill('5');
    await panel.getByLabel('Confirm că aceste sume au fost deja primite', { exact: true }).check();
    const path = `/api/tenant/orders/${order.id}/payments`;
    let frozen = '';
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      frozen = route.request().postData()!;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await panel.getByRole('button', { name: 'Înregistrează tranșa', exact: true }).click();
    await expect(
      detail.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    ).toBeVisible();
    await expect(panel.getByLabel('Tura proprie pentru operație', { exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(detail).toBeVisible();
    const pointers = await cashPointers(page, 'FINANCIAL');
    expect(pointers).toHaveLength(1);
    expect(pointers[0].value.command).toEqual({
      kind: 'COLLECT',
      orderId: order.id,
      locationId: f.location.id,
      requestKey: JSON.parse(frozen).requestKey,
    });
    expect(pointers[0].value.command).not.toHaveProperty('cashShiftId');
    await page.unroute(`**${path}`);
    await f.close(shift.id, page);
    const closing = await f.detail(shift.id);
    await page.reload();
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Casier');
    const result = await submit(
      page,
      `/api/tenant/orders/${order.id}/payment-commands/resolution`,
      page.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    );
    expect(result.status).toBe('SUCCEEDED');
    expect(await cashPointers(page, 'FINANCIAL')).toEqual([]);
    expect((await f.request(`/orders/${order.id}/payments`)).payments).toHaveLength(1);
    expect(await f.detail(shift.id)).toEqual(closing);
    const retry = await api(page, `/orders/${order.id}/payments`, JSON.parse(frozen));
    expect(retry.status()).toBe(200);
    expect(await f.detail(shift.id)).toEqual(closing);
  } finally {
    await f.dispose();
  }
});

test('ture recovery financiar: rambursarea confirmată se rezolvă după reload fără dublare', async ({
  browser,
}) => {
  const f = await cashShiftsFixture(browser);
  try {
    const page = await f.login();
    const { shift } = await f.open(page, '0');
    const order = await f.order();
    await f.request(
      `/orders/${order.id}/payments`,
      {
        version: order.version,
        requestKey: crypto.randomUUID(),
        cashShiftId: shift.id,
        confirmed: true,
        payments: [{ method: 'CARD', amount: '10' }],
      },
      page,
    );
    const detail = await openCashierOrder(page, order.number);
    const panel = detail.getByRole('region', { name: 'Plăți și rambursări', exact: true });
    await panel.getByText('Încasări originale', { exact: true }).click();
    await panel.getByRole('button', { name: 'Rambursează', exact: true }).click();
    await panel.getByLabel('Tura proprie pentru operație', { exact: true }).selectOption(shift.id);
    await panel.getByLabel('Suma rambursată (MDL)', { exact: true }).fill('2');
    await panel
      .getByLabel('Motivul rambursării', { exact: true })
      .fill('Motiv fără persistență în browser');
    await panel
      .getByLabel('Confirm că suma a fost deja restituită prin metoda plății originale', {
        exact: true,
      })
      .check();
    const path = `/api/tenant/orders/${order.id}/refunds`;
    let frozen = '';
    await page.route(`**${path}`, async (route) => {
      frozen = route.request().postData()!;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await panel.getByRole('button', { name: 'Înregistrează rambursarea', exact: true }).click();
    await expect(
      detail.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    ).toBeVisible();
    const pointers = await cashPointers(page, 'FINANCIAL');
    expect(pointers[0].value.command.kind).toBe('REFUND');
    expect(Object.keys(pointers[0].value.command).sort()).toEqual([
      'kind',
      'locationId',
      'orderId',
      'requestKey',
    ]);
    expect(JSON.stringify(pointers)).not.toContain('Motiv fără persistență');
    await page.unroute(`**${path}`);
    await f.close(shift.id, page);
    const closed = await f.detail(shift.id);
    await page.reload();
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Casier');
    const result = await submit(
      page,
      `/api/tenant/orders/${order.id}/payment-commands/resolution`,
      page.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    );
    expect(result.command.kind).toBe('REFUND');
    expect(result.status).toBe('SUCCEEDED');
    expect(await cashPointers(page, 'FINANCIAL')).toEqual([]);
    expect((await api(page, `/orders/${order.id}/refunds`, JSON.parse(frozen))).status()).toBe(200);
    expect(
      (await f.request(`/orders/${order.id}/payment-operations`)).operations.filter(
        (row: { kind: string }) => row.kind === 'REFUND',
      ),
    ).toHaveLength(1);
    expect(await f.detail(shift.id)).toEqual(closed);
  } finally {
    await f.dispose();
  }
});

test('ture recovery financiar: MANUAL comis se recuperează după reload prin cheia sa fără a repeta încasarea', async ({
  browser,
}) => {
  const f = await cashShiftsFixture(browser);
  try {
    const page = f.admin;
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    const { shift } = await f.open(page, '0');
    const order = await f.order(true);
    const detail = await openCashierOrder(page, order.number);
    await detail.getByRole('button', { name: 'Checkout real', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Checkout real', exact: true });
    await form.getByLabel('Tura proprie pentru operație', { exact: true }).selectOption(shift.id);
    await form.getByLabel('Metoda de încasare', { exact: true }).selectOption('CARD');
    await form.getByLabel('Confirm că plata a fost deja primită', { exact: true }).check();
    const path = `/api/tenant/orders/${order.id}/checkout/manual`;
    let frozen = '';
    await page.route(`**${path}`, async (route) => {
      frozen = route.request().postData()!;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    const lostResponse = page.waitForEvent(
      'requestfailed',
      (request) => new URL(request.url()).pathname === path && request.method() === 'POST',
    );
    await form.getByRole('button', { name: 'Înregistrează încasarea', exact: true }).click();
    await lostResponse;
    await expect(
      form.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    ).toBeVisible();
    await expect(form.getByLabel('Tura proprie pentru operație', { exact: true })).toBeDisabled();
    await expect.poll(() => cashPointers(page, 'FINANCIAL')).toHaveLength(1);
    const pointers = await cashPointers(page, 'FINANCIAL');
    expect(pointers[0].value.command).toEqual({
      kind: 'CHECKOUT_MANUAL',
      orderId: order.id,
      locationId: f.location.id,
      requestKey: JSON.parse(frozen).requestKey,
    });
    await page.keyboard.press('Escape');
    await expect(form).toBeVisible();
    await page.unroute(`**${path}`);
    await f.close(shift.id, page);
    const closed = await f.detail(shift.id);
    await page.reload();
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Casier');
    const result = await submit(
      page,
      `/api/tenant/orders/${order.id}/manual-checkout-resolution`,
      page.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    );
    expect(result.status).toBe('SUCCEEDED');
    expect(result.result.receipt).toMatchObject({
      mode: 'MANUAL',
      isFiscal: false,
      method: 'CARD',
    });
    expect(await cashPointers(page, 'FINANCIAL')).toEqual([]);
    const replay = await api(page, `/orders/${order.id}/checkout/manual`, JSON.parse(frozen));
    expect(replay.status()).toBe(200);
    expect((await replay.json()).receipt).toEqual(result.result.receipt);
    expect((await f.request(`/orders/${order.id}/payments`)).payments).toHaveLength(1);
    expect(await f.detail(shift.id)).toEqual(closed);
  } finally {
    await f.dispose();
  }
});
