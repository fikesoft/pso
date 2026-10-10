import { test, expect } from '@playwright/test';
import { cashPointers, cashShiftsFixture, shiftOpenForm, shiftCard } from './cash-shifts-setup';
import { navigateSection, submit } from './support/browser-helpers';

test('ture recovery: OPEN pierdut după commit și CLOSE pierdut supraviețuiesc reloadului fără sume în pointer', async ({
  browser,
}) => {
  const f = await cashShiftsFixture(browser);
  try {
    const register = await f.register();
    const page = await f.login();
    await navigateSection(page, 'Case');
    const form = await shiftOpenForm(page, register.id, '100');
    const path = `/api/tenant/cash-registers/${register.id}/open`;
    let body: Record<string, unknown> = {};
    await page.route(`**${path}`, async (route) => {
      body = route.request().postDataJSON();
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await form.getByRole('button', { name: 'Deschide tura', exact: true }).click();
    await expect(
      form.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    ).toBeVisible();
    await expect(form.getByLabel('Fond inițial (MDL)', { exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(form).toBeVisible();
    const saved = await cashPointers(page, 'CASH');
    expect(saved).toHaveLength(1);
    expect(Object.keys(saved[0].value).sort()).toEqual([
      'actorUserId',
      'command',
      'locationId',
      'organizationId',
    ]);
    expect(saved[0].value.command).toEqual({
      kind: 'OPEN',
      registerId: register.id,
      locationId: f.location.id,
      requestKey: body.requestKey,
    });
    await page.unroute(`**${path}`);
    await page.reload();
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Case');
    await expect(
      page.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }),
    ).toHaveCount(0);
    await submit(
      page,
      '/api/tenant/cash-commands/resolution',
      page.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    );
    expect(await cashPointers(page, 'CASH')).toEqual([]);
    const list = await f.request(`/cash-shifts?locationId=${f.location.id}`, undefined, page);
    expect(list.shifts).toHaveLength(1);
    const shift = list.shifts[0];
    await shiftCard(page, register.code)
      .getByRole('button', { name: 'Detaliile turei', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Detaliile turei', exact: true })
      .getByRole('button', { name: 'Închide tura', exact: true })
      .click();
    const close = page.getByRole('dialog', { name: 'Închide tura', exact: true });
    await close.getByLabel('Numerar numărat (MDL)', { exact: true }).fill('99');
    await close
      .getByLabel('Motivul diferenței', { exact: true })
      .fill('Motivul nu se persistă local');
    await close
      .getByLabel('Confirm numerarul numărat și închiderea definitivă a turei', { exact: true })
      .check();
    const closePath = `/api/tenant/cash-shifts/${shift.id}/close`;
    await page.route(`**${closePath}`, async (route) => {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await close.getByRole('button', { name: 'Închide tura', exact: true }).click();
    await expect(
      close.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    ).toBeVisible();
    const pointer = await cashPointers(page, 'CASH');
    expect(Object.keys(pointer[0].value.command).sort()).toEqual([
      'kind',
      'locationId',
      'requestKey',
      'shiftId',
    ]);
    expect(JSON.stringify(pointer)).not.toContain('Motivul nu se persistă local');
    await page.unroute(`**${closePath}`);
    await page.reload();
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Case');
    const resolved = await submit(
      page,
      '/api/tenant/cash-commands/resolution',
      page.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    );
    expect(resolved.result.closing).toMatchObject({
      expectedCash: '100.00',
      countedCash: '99.00',
      difference: '-1.00',
    });
    expect(await cashPointers(page, 'CASH')).toEqual([]);
  } finally {
    await f.dispose();
  }
});

test('ture recovery: OPEN necomis se retrage definitiv, cererea întârziată nu poate deschide tura', async ({
  browser,
}) => {
  const f = await cashShiftsFixture(browser);
  try {
    const register = await f.register();
    const page = await f.login();
    await navigateSection(page, 'Case');
    const form = await shiftOpenForm(page, register.id, '5');
    const path = `/api/tenant/cash-registers/${register.id}/open`;
    let body: Record<string, unknown> = {};
    await page.route(`**${path}`, async (route) => {
      body = route.request().postDataJSON();
      await route.abort('failed');
    });
    await form.getByRole('button', { name: 'Deschide tura', exact: true }).click();
    await expect(
      form.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    ).toBeVisible();
    await page.unroute(`**${path}`);
    const result = await submit(
      page,
      '/api/tenant/cash-commands/resolution',
      form.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    );
    expect(result.status).toBe('RETIRED');
    await expect(
      page.getByText('Tentativa a fost retrasă definitiv. Poți începe explicit o operație nouă.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(await cashPointers(page, 'CASH')).toEqual([]);
    const { api } = await import('./support/browser-helpers');
    expect((await api(page, `/cash-registers/${register.id}/open`, body)).status()).toBe(409);
    expect(
      (await f.request(`/cash-shifts?locationId=${f.location.id}`, undefined, page)).shifts,
    ).toHaveLength(0);
    const retry = await shiftOpenForm(page, register.id, '5');
    await submit(page, path, retry.getByRole('button', { name: 'Deschide tura', exact: true }));
  } finally {
    await f.dispose();
  }
});
