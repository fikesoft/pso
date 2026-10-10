import { completePacking } from './support/complete-packing';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, isolatedPage, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

export async function cashShiftsFixture(browser: Browser) {
  const f = await operationsFixture(browser);
  const contexts: BrowserContext[] = [];
  try {
    const request = async (
      path: string,
      body?: unknown,
      actor = f.admin,
      method: 'GET' | 'POST' | 'PATCH' = body === undefined ? 'GET' : 'POST',
    ) => {
      const response = await api(actor, path, body, method);
      expect(response.status(), `${method} ${path}`).toBe(200);
      return response.json();
    };
    const actors: Record<string, { pin: string; user: { id: string } }> = {};
    for (const [name, permissions] of Object.entries({
      cashier: [
        'cash.registers.read',
        'cash.shifts.read',
        'cash.shifts.open',
        'cash.shifts.close',
        'orders.read',
        'payments.collect',
        'payments.refund',
      ],
      second: [
        'cash.registers.read',
        'cash.shifts.read',
        'cash.shifts.open',
        'cash.shifts.close',
        'orders.read',
        'payments.collect',
        'payments.refund',
      ],
      reader: ['cash.registers.read', 'cash.shifts.read'],
      closeOnly: ['cash.shifts.close'],
    })) {
      const { role } = await request('/roles', {
        name: `E2E ture ${name}`,
        permissions: permissions.map((permission) => ({ permission })),
      });
      actors[name] = await request('/staff', {
        login: `shift-${name}`,
        displayName: `Casier ture ${name}`,
        authenticationMethod: 'PIN',
        locationIds: [f.location.id],
        assignments: [
          { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.location.id },
        ],
      });
    }
    const login = async (name = 'cashier') => {
      const page = await isolatedPage(browser, contexts);
      await page.goto(`${tenantOrigin}/c/${f.slug}/login`);
      await page.getByLabel('Cod PIN', { exact: true }).fill(actors[name]!.pin);
      await submit(
        page,
        '/api/tenant/auth/pin',
        page.getByRole('button', { name: 'Intră cu cod PIN', exact: true }),
      );
      await expect(page.getByRole('heading', { name: /^Bun venit,/ })).toBeVisible();
      await page
        .getByRole('combobox', { name: 'Context', exact: true })
        .selectOption(f.location.id);
      return page;
    };
    const register = async (name = 'Casa pentru tură E2E') =>
      (
        await request('/cash-registers', {
          locationId: f.location.id,
          requestKey: randomUUID(),
          code: `S-${randomUUID().slice(0, 8)}`,
          name,
        })
      ).register;
    const open = async (actor: Page, openingAmount = '0', name?: string) => {
      const target = await register(name);
      const body = { locationId: f.location.id, requestKey: randomUUID(), openingAmount };
      const { shift } = await request(`/cash-registers/${target.id}/open`, body, actor);
      return { register: target, shift, body };
    };
    const detail = async (id: string, actor = f.admin) =>
      request(`/cash-shifts/${id}?locationId=${f.location.id}`, undefined, actor);
    const close = async (id: string, actor: Page, changes: Record<string, unknown> = {}) => {
      const current = await detail(id, actor);
      return request(
        `/cash-shifts/${id}/close`,
        {
          locationId: f.location.id,
          version: current.shift.version,
          requestKey: randomUUID(),
          countedCash: current.summary.expectedCash,
          ...changes,
        },
        actor,
      );
    };
    const order = async (ready = false, price = '30') => {
      const { product } = await request('/catalog/products', {
        locationId: f.location.id,
        name: 'Produs probă ture',
        sku: randomUUID(),
        price,
      });
      const created = (
        await request('/orders', {
          locationId: f.location.id,
          requestKey: randomUUID(),
          serviceType: 'PICKUP',
          items: [{ productId: product.id, quantity: '1' }],
        })
      ).order;
      const path = `/orders/${created.id}`;
      if (!ready)
        return (
          await request(`${path}/confirm`, { version: created.version, requestKey: randomUUID() })
        ).order;
      const sent = await request(`${path}/send`, {
        version: created.version,
        requestKey: randomUUID(),
      });
      for (const [index, status] of ['PREPARING', 'READY'].entries())
        await request(
          `/kitchen/tickets/${sent.ticket.id}`,
          { version: index + 1, status },
          f.admin,
          'PATCH',
        );
      return completePacking(f.admin, created.id);
    };
    return {
      ...f,
      actors,
      request,
      login,
      register,
      open,
      close,
      detail,
      order,
      dispose: async () => {
        for (const context of contexts) await context.close();
        await f.dispose();
      },
    };
  } catch (error) {
    for (const context of contexts) await context.close();
    await f.dispose();
    throw error;
  }
}

export async function cashPointers(page: Page, channel: 'CASH' | 'FINANCIAL') {
  return page.evaluate(
    (selected) =>
      Object.entries(sessionStorage)
        .filter(([key]) => key.startsWith(`pos.cash-command:${selected}:`))
        .map(([key, value]) => ({ key, value: JSON.parse(value) })),
    channel,
  );
}

export async function shiftOpenForm(page: Page, registerId: string, amount: string) {
  await page.getByRole('button', { name: 'Deschide tura', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Deschide tura', exact: true });
  await form.getByLabel('Casa', { exact: true }).selectOption(registerId);
  await form.getByLabel('Fond inițial (MDL)', { exact: true }).fill(amount);
  await form.getByLabel('Confirm fondul inițial și deschiderea turei', { exact: true }).check();
  return form;
}

export function shiftCard(page: Page, registerCode: string) {
  return page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: new RegExp(`^${registerCode} ·`) }) });
}
