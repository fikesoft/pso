import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  cashRegisterFixture,
  newRegisterForm,
  registerCard,
  registerPointers,
} from './cash-register-setup';
import { api, navigateSection, submit } from './support/browser-helpers';

test('case: răspuns pierdut după commit, corp retry exact și rezoluție după reload fără nume în storage', async ({
  browser,
}) => {
  const f = await cashRegisterFixture(browser);
  const page = f.admin;
  try {
    await navigateSection(page, 'Case');
    const pattern = '**/api/tenant/cash-registers';
    let frozen = '';
    await page.route(pattern, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      frozen = route.request().postData()!;
      expect(await registerPointers(page)).toHaveLength(1);
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    });
    const form = await newRegisterForm(page, 'EXACT', 'Denumire exclusiv memorie');
    await form.getByRole('button', { name: 'Salvează', exact: true }).click();
    const retry = form.getByRole('button', { name: 'Reîncearcă exact tentativa', exact: true });
    await expect(retry).toBeEnabled();
    await expect(form.getByLabel('Denumirea casei', { exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: 'Închide', exact: true }).click();
    await expect(form).toBeVisible();
    const pointers = await registerPointers(page);
    expect(pointers).toHaveLength(1);
    expect(Object.keys(pointers[0]!.value).sort()).toEqual([
      'actorUserId',
      'kind',
      'locationId',
      'organizationId',
      'requestKey',
    ]);
    expect(JSON.stringify(pointers)).not.toMatch(
      /Denumire exclusiv memorie|EXACT|code|name|requestHash/,
    );
    await page.unroute(pattern);
    const retried = page.waitForRequest(
      (request) => request.url().endsWith('/cash-registers') && request.method() === 'POST',
    );
    const saved = await submit(page, '/api/tenant/cash-registers', retry);
    expect((await retried).postData()).toBe(frozen);
    await expect(registerCard(page, 'Denumire exclusiv memorie')).toBeVisible();
    expect(await registerPointers(page)).toEqual([]);
    expect(
      (await (await api(page, `/cash-registers?locationId=${f.location.id}`)).json()).registers,
    ).toHaveLength(1);

    let committedId = '';
    await page.route(pattern, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committedId = (await response.json()).register.id;
      await route.abort('failed');
    });
    const second = await newRegisterForm(page, 'RELOAD', 'Snapshot anterior');
    await second.getByRole('button', { name: 'Salvează', exact: true }).click();
    await expect(
      second.getByRole('button', { name: 'Verifică rezultatul tentativei', exact: true }),
    ).toBeEnabled();
    await page.unroute(pattern);
    expect(
      (
        await api(
          page,
          `/cash-registers/${committedId}`,
          {
            locationId: f.location.id,
            version: 1,
            requestKey: randomUUID(),
            name: 'Numele curent după rename',
          },
          'PATCH',
        )
      ).status(),
    ).toBe(200);
    await f.refresh();
    await expect(page.getByRole('button', { name: 'Adaugă casă', exact: true })).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Reîncearcă exact tentativa', exact: true }),
    ).toHaveCount(0);
    const resolved = await submit(
      page,
      '/api/tenant/cash-register-commands/resolution',
      page.getByRole('button', { name: 'Verifică rezultatul tentativei', exact: true }),
    );
    expect(resolved).toMatchObject({
      status: 'SUCCEEDED',
      register: { id: committedId, name: 'Snapshot anterior', version: 1 },
    });
    await expect(registerCard(page, 'Numele curent după rename')).toBeVisible();
    await expect(registerCard(page, 'Snapshot anterior')).toHaveCount(0);
    expect(await registerPointers(page)).toEqual([]);
    expect(saved.register.code).toBe('EXACT');
  } finally {
    await f.dispose();
  }
});

test('case: tentativa nelivrată este retrasă după reload înainte de o cheie nouă', async ({
  browser,
}) => {
  const f = await cashRegisterFixture(browser);
  const page = f.admin;
  try {
    await navigateSection(page, 'Case');
    let frozen = '';
    await page.route('**/api/tenant/cash-registers', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      frozen = route.request().postData()!;
      await route.abort('failed');
    });
    const form = await newRegisterForm(page, 'RETIRED', 'Nu a ajuns la server');
    await form.getByRole('button', { name: 'Salvează', exact: true }).click();
    await expect(
      form.getByRole('button', { name: 'Verifică rezultatul tentativei', exact: true }),
    ).toBeEnabled();
    await page.unroute('**/api/tenant/cash-registers');
    await f.refresh();
    await page
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.otherLocation.id);
    await expect(page.getByRole('button', { name: 'Adaugă casă', exact: true })).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Verifică rezultatul tentativei', exact: true }),
    ).toHaveCount(0);
    expect(await registerPointers(page)).toHaveLength(1);
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await expect(page.getByRole('button', { name: 'Adaugă casă', exact: true })).toBeDisabled();
    const retired = await submit(
      page,
      '/api/tenant/cash-register-commands/resolution',
      page.getByRole('button', { name: 'Verifică rezultatul tentativei', exact: true }),
    );
    expect(retired.status).toBe('RETIRED');
    expect((await api(page, '/cash-registers', JSON.parse(frozen))).status()).toBe(409);
    expect(await registerPointers(page)).toEqual([]);
    const next = await newRegisterForm(page, 'RETIRED', 'Noua tentativă explicită');
    const sending = page.waitForRequest(
      (request) => request.url().endsWith('/cash-registers') && request.method() === 'POST',
    );
    await submit(
      page,
      '/api/tenant/cash-registers',
      next.getByRole('button', { name: 'Salvează', exact: true }),
    );
    expect((await sending).postDataJSON().requestKey).not.toBe(JSON.parse(frozen).requestKey);
    await expect(registerCard(page, 'Noua tentativă explicită')).toBeVisible();
  } finally {
    await f.dispose();
  }
});
