import { completePacking } from './support/complete-packing';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, isolatedPage, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

export async function cashierFixture(browser: Browser) {
  const f = await operationsFixture(browser);
  const contexts: BrowserContext[] = [];
  try {
    const request = async (
      path: string,
      body?: unknown,
      method: 'GET' | 'POST' | 'PATCH' = body === undefined ? 'GET' : 'POST',
    ) => {
      const response = await api(f.admin, path, body, method);
      expect(response.status(), `${method} ${path}`).toBe(200);
      return response.json();
    };
    const product = (
      await request('/catalog/products', {
        locationId: f.location.id,
        name: 'Produs casier',
        sku: 'CASHIER',
        price: '30',
      })
    ).product;
    const actors: Record<string, { pin: string }> = {};
    for (const [name, permissions] of Object.entries({
      collector: ['orders.read', 'payments.collect'],
      refunder: ['orders.read', 'payments.refund'],
      operator: ['orders.read', 'orders.create', 'payments.collect'],
      creator: ['orders.create'],
      reader: ['orders.read'],
      blind: ['payments.collect', 'payments.refund'],
    })) {
      const role = (
        await request('/roles', {
          name: `Casier ${name}`,
          permissions: [
            ...permissions,
            ...(['collector', 'refunder', 'operator'].includes(name)
              ? ['cash.registers.read', 'cash.shifts.read', 'cash.shifts.open']
              : []),
          ].map((permission) => ({ permission })),
        })
      ).role;
      actors[name] = await request('/staff', {
        login: `cashier-${name}`,
        displayName: `Casier ${name}`,
        authenticationMethod: 'PIN',
        locationIds: [f.location.id],
        assignments: [
          { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.location.id },
        ],
      });
    }
    const login = async (kind: string) => {
      const page = await isolatedPage(browser, contexts);
      const reads: string[] = [];
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (
          path.startsWith('/api/tenant/') &&
          (request.method() === 'GET' || path.endsWith('/search'))
        )
          reads.push(path);
      });
      await page.goto(`${tenantOrigin}/c/${f.slug}/login`);
      await page.getByLabel('Cod PIN', { exact: true }).fill(actors[kind]!.pin);
      await submit(
        page,
        '/api/tenant/auth/pin',
        page.getByRole('button', { name: 'Intră cu cod PIN', exact: true }),
      );
      await expect(page.getByRole('heading', { name: /^Bun venit,/ })).toBeVisible();
      await page
        .getByRole('combobox', { name: 'Context', exact: true })
        .selectOption(f.location.id);
      return { page, reads };
    };
    const current = async (id: string) => (await request(`/orders/${id}`)).order;
    const command = async (id: string, action: string, extra: Record<string, unknown> = {}) =>
      request(`/orders/${id}/${action}`, {
        version: (await current(id)).version,
        requestKey: randomUUID(),
        ...extra,
      });
    const create = async () =>
      (
        await request('/orders', {
          locationId: f.location.id,
          requestKey: randomUUID(),
          serviceType: 'PICKUP',
          items: [{ productId: product.id, quantity: '1' }],
        })
      ).order;
    const ready = async () => {
      const order = await create();
      const sent = await command(order.id, 'send');
      for (const [index, status] of ['PREPARING', 'READY'].entries()) {
        await request(
          `/kitchen/tickets/${sent.ticket.id}`,
          { version: index + 1, status },
          'PATCH',
        );
      }
      return completePacking(f.admin, order.id);
    };
    const complete = async () => {
      const order = await ready();
      await command(order.id, 'complete');
      return current(order.id);
    };
    return {
      ...f,
      product,
      login,
      request,
      current,
      command,
      create,
      ready,
      complete,
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

export async function openCashierOrder(page: Page, number: number) {
  await navigateSection(page, 'Casier');
  const card = page
    .getByRole('region', { name: 'Comenzi active', exact: true })
    .getByTestId('active-order-card')
    .filter({ has: page.getByRole('heading', { name: `Comanda #${number}`, exact: true }) });
  const open = card.getByRole('button', { name: 'Detalii și plăți', exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  return page.getByRole('dialog', { name: `Comanda #${number}`, exact: true });
}
