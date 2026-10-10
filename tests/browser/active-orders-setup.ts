import { completePacking } from './support/complete-packing';
import { expect } from '@playwright/test';
import type { Browser, BrowserContext } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, isolatedPage, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

export async function activeOrdersFixture(browser: Browser) {
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
        name: 'Produs activ',
        sku: 'ACTIVE',
        price: '10',
      })
    ).product;
    const makeActor = async (name: string, permissions: string[]) => {
      const role = (
        await request('/roles', {
          name,
          permissions: permissions.map((permission) => ({ permission })),
        })
      ).role;
      return request('/staff', {
        login: name.toLowerCase().replaceAll(' ', '-'),
        displayName: name,
        authenticationMethod: 'PIN',
        locationIds: [f.location.id],
        assignments: [
          { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.location.id },
        ],
      });
    };
    const actors = {
      operator: await makeActor('Active operator', ['orders.read', 'orders.create']),
      reader: await makeActor('Active reader', ['orders.read']),
      creator: await makeActor('Active creator', ['orders.create']),
      courier: await makeActor('Active courier', ['orders.read', 'delivery.update']),
    };
    const login = async (kind: 'operator' | 'reader' | 'creator' = 'operator') => {
      const page = await isolatedPage(browser, contexts);
      await page.goto(`${tenantOrigin}/c/${f.slug}/login`);
      await page.getByLabel('Cod PIN', { exact: true }).fill(actors[kind].pin);
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
    const operator = await login();
    await navigateSection(operator, 'Operator');
    const create = async (extra: Record<string, unknown> = {}) =>
      (
        await request('/orders', {
          locationId: f.location.id,
          requestKey: crypto.randomUUID(),
          serviceType: 'PICKUP',
          items: [{ productId: product.id, quantity: '1' }],
          ...extra,
        })
      ).order;
    const current = async (id: string) => (await request(`/orders/${id}`)).order;
    const command = async (id: string, action: string, extra: Record<string, unknown> = {}) =>
      request(`/orders/${id}/${action}`, {
        version: (await current(id)).version,
        requestKey: crypto.randomUUID(),
        ...extra,
      });
    const complete = async (extra: Record<string, unknown> = {}) => {
      const order = await create(extra);
      const sent = await command(order.id, 'send');
      for (const [index, status] of ['PREPARING', 'READY'].entries())
        await request(
          `/kitchen/tickets/${sent.ticket.id}`,
          { version: index + 1, status },
          'PATCH',
        );
      await completePacking(f.admin, order.id);
      await command(order.id, 'complete');
      return current(order.id);
    };
    const panel = operator.getByRole('region', { name: 'Comenzi active', exact: true });
    const draft = operator.getByRole('region', { name: 'Comanda curentă', exact: true });
    return {
      ...f,
      operator,
      panel,
      draft,
      product,
      actors,
      login,
      request,
      create,
      current,
      command,
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
