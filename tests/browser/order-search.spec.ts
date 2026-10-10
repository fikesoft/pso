import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import type { OrderSearchRequest } from '../../packages/contracts/src';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, session, submit } from './support/browser-helpers';

async function submitSearch(
  page: Page,
  button: Locator,
  expected: OrderSearchRequest,
  nextPage = false,
) {
  const pending = page.waitForResponse((response) => {
    const request = response.request();
    if (!response.url().endsWith('/api/tenant/orders/search') || request.method() !== 'POST')
      return false;
    const actual = request.postDataJSON() as Record<string, unknown>;
    return (
      Object.keys(actual).length === Object.keys(expected).length + (nextPage ? 1 : 0) &&
      (!nextPage || typeof actual.cursor === 'string') &&
      Object.entries(expected).every(([key, value]) => actual[key] === value)
    );
  });
  await button.click();
  const response = await pending;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({
    ...expected,
    ...(nextPage ? { cursor: expect.any(String) } : {}),
  });
  return response.json();
}

test('căutare comenzi: contact manual, filtre combinate în corp POST și resetare fără date private în URL sau storage', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser);
  const { admin, location } = f;
  try {
    const urls: string[] = [];
    admin.on('request', (request) => urls.push(decodeURIComponent(request.url())));
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = admin.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await draft.getByLabel('Canalul comenzii', { exact: true }).selectOption('PHONE');
    await draft.getByLabel('Numele clientului', { exact: true }).fill('Maria Popescu');
    await draft.getByLabel('Telefonul clientului', { exact: true }).fill('+373 (60) 123-456');
    await draft.getByRole('button', { name: /Cafea sintetică/ }).click();
    const created = await submit(
      admin,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    const details = admin.getByRole('dialog', { name: 'Comanda #1', exact: true });
    await expect(details.getByRole('region', { name: 'Client', exact: true })).toContainText(
      'Maria Popescu',
    );
    await admin.keyboard.press('Escape');
    expect(
      (
        await api(admin, '/orders', {
          locationId: location.id,
          serviceType: 'PICKUP',
          requestKey: randomUUID(),
          items: [{ productId: product.id, quantity: '1' }],
        })
      ).status(),
    ).toBe(200);
    await admin.locator('summary').filter({ hasText: 'Caută comenzi' }).click();
    const search = admin.getByRole('form', { name: 'Caută comenzi', exact: true });
    await search.getByRole('button', { name: 'Reîncarcă creatorii', exact: true }).click();
    const actorId = (await session(admin)).user.id;
    await expect(
      search.getByLabel('Creată de', { exact: true }).locator(`option[value="${actorId}"]`),
    ).toHaveCount(1);
    await search.getByLabel('Numărul comenzii', { exact: true }).fill(String(created.order.number));
    await search.getByLabel('Numele clientului', { exact: true }).fill('  maria  popescu ');
    await search.getByLabel('Telefonul clientului', { exact: true }).fill('373.60.123456');
    await search.getByLabel('Creată de', { exact: true }).selectOption(actorId);
    await search.getByLabel('Starea comenzii', { exact: true }).selectOption('DRAFT');
    await search.getByLabel('Sursa comenzii', { exact: true }).selectOption('PHONE');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' }).format(
      new Date(),
    );
    await search.getByLabel('Creată începând cu', { exact: true }).fill(today);
    await search.getByLabel('Creată până la', { exact: true }).fill(today);
    const found = await submitSearch(
      admin,
      search.getByRole('button', { name: 'Aplică filtrele', exact: true }),
      {
        locationId: location.id,
        number: created.order.number,
        customerName: 'maria  popescu',
        customerPhone: '373.60.123456',
        createdByUserId: actorId,
        source: 'PHONE',
        status: 'DRAFT',
        createdFrom: today,
        createdTo: today,
      },
    );
    expect(found.orders.map((order: { id: string }) => order.id)).toEqual([created.order.id]);
    await expect(admin.getByRole('button', { name: 'Deschide comanda', exact: true })).toHaveCount(
      1,
    );
    await expect(search).toContainText('Fusul orar al datelor: Europe/Chisinau.');
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('order-search-360.png'), fullPage: true });
    const privateState = await admin.evaluate(() =>
      JSON.stringify({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
      }),
    );
    for (const text of [urls.join('\n'), admin.url(), privateState])
      expect(text).not.toMatch(/Maria Popescu|maria.*popescu|373.*60.*123.*456/);
    const reset = await submitSearch(
      admin,
      search.getByRole('button', { name: 'Resetează filtrele', exact: true }),
      { locationId: location.id },
    );
    expect(reset.orders).toHaveLength(2);
    await expect(search.getByLabel('Numele clientului', { exact: true })).toHaveValue('');
    await expect(search.getByLabel('Numărul comenzii', { exact: true })).toHaveValue('');
    await search.getByLabel('Numărul comenzii', { exact: true }).fill('2');
    await submitSearch(
      admin,
      search.getByRole('button', { name: 'Aplică filtrele', exact: true }),
      { locationId: location.id, number: 2 },
    );
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    await expect(admin.getByRole('region', { name: 'Client', exact: true })).toContainText(
      'Datele clientului nu au fost înregistrate.',
    );
  } finally {
    await f.dispose();
  }
});

test('căutare comenzi: paginare opacă fără duplicate și schimbarea filtrelor elimină cursorul anterior', async ({
  browser,
}) => {
  const f = await operationsFixture(browser);
  const { admin, location } = f;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    for (let index = 0; index < 51; index++) {
      expect(
        (
          await api(admin, '/orders', {
            locationId: location.id,
            serviceType: 'PICKUP',
            requestKey: randomUUID(),
            customer: { name: 'Grup mobil sintetic', phone: '060777888' },
            items: [{ productId: product.id, quantity: '1' }],
          })
        ).status(),
      ).toBe(200);
    }
    await navigateSection(admin, 'Comenzi');
    await admin.locator('summary').filter({ hasText: 'Caută comenzi' }).click();
    const search = admin.getByRole('form', { name: 'Caută comenzi', exact: true });
    await search.getByLabel('Numele clientului', { exact: true }).fill('grup mobil sintetic');
    const first = await submitSearch(
      admin,
      search.getByRole('button', { name: 'Aplică filtrele', exact: true }),
      { locationId: location.id, customerName: 'grup mobil sintetic' },
    );
    expect(first.orders).toHaveLength(50);
    await expect(admin.getByRole('button', { name: 'Deschide comanda', exact: true })).toHaveCount(
      50,
    );
    const next = await submitSearch(
      admin,
      admin.getByRole('button', { name: 'Încarcă mai multe', exact: true }),
      { locationId: location.id, customerName: 'grup mobil sintetic' },
      true,
    );
    expect(next.orders).toHaveLength(1);
    await expect(admin.getByRole('button', { name: 'Deschide comanda', exact: true })).toHaveCount(
      51,
    );
    expect(
      new Set([...first.orders, ...next.orders].map((order: { id: string }) => order.id)).size,
    ).toBe(51);
    await search.getByLabel('Numărul comenzii', { exact: true }).fill('1');
    const filtered = await submitSearch(
      admin,
      search.getByRole('button', { name: 'Aplică filtrele', exact: true }),
      { locationId: location.id, customerName: 'grup mobil sintetic', number: 1 },
    );
    expect(filtered.orders).toHaveLength(1);
    await expect(admin.getByRole('button', { name: 'Deschide comanda', exact: true })).toHaveCount(
      1,
    );
    await expect(admin.getByRole('button', { name: 'Încarcă mai multe', exact: true })).toHaveCount(
      0,
    );
    await admin
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.otherLocation.id);
    await admin.locator('summary').filter({ hasText: 'Caută comenzi' }).click();
    await expect(search.getByLabel('Numele clientului', { exact: true })).toHaveValue('');
    await expect(search.getByLabel('Numărul comenzii', { exact: true })).toHaveValue('');
  } finally {
    await f.dispose();
  }
});
