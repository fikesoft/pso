import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, localOnly, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

test('etape acces: revocarea blochează recuperarea și nu confirmă un rezultat necunoscut', async ({
  browser,
}) => {
  const f = await operationsFixture(browser);
  const context = await browser.newContext();
  await localOnly(context);
  const page = await context.newPage();
  try {
    const productResponse = await api(f.admin, '/catalog/products', {
      locationId: f.location.id,
      name: 'Produs etape acces',
      sku: 'COURSE-ACCESS',
      price: '10',
    });
    expect(productResponse.status()).toBe(200);
    const { product } = await productResponse.json();
    const orderResponse = await api(f.admin, '/orders', {
      locationId: f.location.id,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: '1', courseNumber: 1 }],
    });
    expect(orderResponse.status()).toBe(200);
    const { order } = await orderResponse.json();
    const sent = await api(f.admin, `/orders/${order.id}/send`, {
      version: order.version,
      requestKey: randomUUID(),
    });
    expect(sent.status()).toBe(200);
    const { ticket } = await sent.json();
    const roleResponse = await api(f.admin, '/roles', {
      name: 'Lansare locală',
      permissions: ['kitchen.read', 'kitchen.courses.fire'].map((permission) => ({ permission })),
    });
    expect(roleResponse.status()).toBe(200);
    const { role } = await roleResponse.json();
    const createdResponse = await api(f.admin, '/staff', {
      login: 'courses-local',
      displayName: 'Lansare locală',
      authenticationMethod: 'PIN',
      locationIds: [f.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.location.id },
      ],
    });
    expect(createdResponse.status()).toBe(200);
    const created = await createdResponse.json();
    await page.goto(`${tenantOrigin}/c/${f.slug}/login`);
    await page.getByLabel('Cod PIN', { exact: true }).fill(created.pin);
    await submit(
      page,
      '/api/tenant/auth/pin',
      page.getByRole('button', { name: 'Intră cu cod PIN', exact: true }),
    );
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Bucătărie');
    await page.route(
      `**/api/tenant/kitchen/tickets/${ticket.id}/fire`,
      async (route) => {
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('failed');
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Lansează: Etapa 1 · Aperitive', exact: true }).click();
    const resolve = page.getByRole('button', {
      name: 'Verifică rezultatul operației',
      exact: true,
    });
    await expect(resolve).toBeEnabled();
    await page.route('**/api/tenant/kitchen-course-commands/resolution', async (route) => {
      // Revoke after the click starts recovery, before its HTTP request reaches the API.
      // A live revocation may otherwise remove the button before Playwright can click it.
      expect(
        (
          await api(f.admin, `/staff/${created.user.id}/overrides`, {
            permission: 'kitchen.courses.fire',
            effect: 'DENY',
            scopeType: 'LOCATION',
            locationId: f.location.id,
          })
        ).status(),
      ).toBe(200);
      await route.continue();
    });
    const rejected = page.waitForResponse((response) =>
      response.url().endsWith('/api/tenant/kitchen-course-commands/resolution'),
    );
    await resolve.click();
    expect([401, 403]).toContain((await rejected).status());
    await expect(page.getByText('Operația a fost confirmată.', { exact: true })).toHaveCount(0);
    const rows = await (await api(f.admin, `/kitchen/tickets?locationId=${f.location.id}`)).json();
    expect(rows.tickets.find((row: { id: string }) => row.id === ticket.id).version).toBe(2);
  } finally {
    await context.close();
    await f.dispose();
  }
});
