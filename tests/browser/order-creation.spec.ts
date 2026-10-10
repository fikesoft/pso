import { test, expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, session, submit } from './support/browser-helpers';

async function creationFixture(browser: Browser) {
  const f = await operationsFixture(browser);
  try {
    await f.admin
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.location.id);
    const product = await createOperationalProduct(f.admin);
    await navigateSection(f.admin, 'Comenzi');
    await f.admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = f.admin.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await draft.getByLabel('Observații comandă', { exact: true }).fill('Notă privată sintetică');
    await draft.getByRole('button', { name: /Cafea sintetică/ }).click();
    return { ...f, product, draft };
  } catch (error) {
    await f.dispose();
    throw error;
  }
}

async function pointers(page: Page) {
  return page.evaluate(() =>
    Object.entries(sessionStorage)
      .filter(([key]) => key.startsWith('pos.order-creation:'))
      .map(([key, value]) => ({ key, value: JSON.parse(value) as Record<string, string> })),
  );
}

async function verifyOpaquePointer(page: Page, requestKey: string) {
  const stored = await pointers(page);
  expect(stored).toHaveLength(1);
  expect(Object.keys(stored[0]!.value).sort()).toEqual([
    'actorUserId',
    'locationId',
    'organizationId',
    'requestKey',
  ]);
  expect(stored[0]!.value.requestKey).toBe(requestKey);
  for (const value of Object.values(stored[0]!.value)) expect(value).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(stored)).not.toMatch(/Notă privată|Cafea|password|csrf|items|quantity/);
  return stored;
}

test('creare: pierdere înainte de commit, pointer opac înainte de POST și retry identic creează o singură comandă', async ({
  browser,
}) => {
  const f = await creationFixture(browser);
  const { admin, draft } = f;
  try {
    let original = '';
    let storedBeforePost: Awaited<ReturnType<typeof pointers>> = [];
    let header = '';
    await admin.route('**/api/tenant/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      original = route.request().postData()!;
      header = route.request().headers()['idempotency-key']!;
      storedBeforePost = await pointers(admin);
      await route.abort('failed');
    });
    await draft.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    await expect(draft.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    const key = JSON.parse(original).requestKey as string;
    expect(header).toBe(key);
    expect(storedBeforePost).toEqual(await verifyOpaquePointer(admin, key));
    await expect(draft.getByLabel('Observații comandă', { exact: true })).toBeDisabled();
    expect(
      (await (await api(admin, `/orders?locationId=${f.location.id}`)).json()).orders,
    ).toHaveLength(0);
    await admin.unroute('**/api/tenant/orders');
    const retry = admin.waitForRequest(
      (r) => r.url().endsWith('/api/tenant/orders') && r.method() === 'POST',
    );
    const created = await submit(
      admin,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    );
    expect((await retry).postData()).toBe(original);
    expect(created.order.version).toBe(1);
    expect(await pointers(admin)).toHaveLength(0);
    expect(
      (await (await api(admin, `/orders?locationId=${f.location.id}`)).json()).orders,
    ).toHaveLength(1);
  } finally {
    await f.dispose();
  }
});

test('creare: reload recuperează doar pointerul opac, iar rezolvarea repetată după răspuns pierdut găsește aceeași comandă', async ({
  browser,
}) => {
  const f = await creationFixture(browser);
  const { admin, draft } = f;
  try {
    let key = '';
    let committedId = '';
    await admin.route('**/api/tenant/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      key = JSON.parse(route.request().postData()!).requestKey;
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      committedId = (await result.json()).order.id;
      await route.abort('failed');
    });
    await draft.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    await expect(draft.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    const stored = await verifyOpaquePointer(admin, key);
    await admin.unroute('**/api/tenant/orders');
    await admin.reload();
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    await expect(draft.getByText(/Există o cerere de creare cu rezultat necunoscut/)).toBeVisible();
    await expect(draft.getByLabel('Observații comandă', { exact: true })).toHaveValue('');
    await expect(draft.getByLabel('Observații comandă', { exact: true })).toBeDisabled();
    await expect(draft.getByRole('button', { name: 'Salvează ciorna', exact: true })).toHaveCount(
      0,
    );
    await expect(
      draft.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    ).toHaveCount(0);
    expect(await pointers(admin)).toEqual(stored);
    const resolutionPath = '/api/tenant/orders/creation-resolution';
    const auth = await session(admin);
    const origin = new URL(admin.url()).origin;
    const mismatched = await admin.request.post(`${origin}${resolutionPath}`, {
      headers: {
        Origin: origin,
        'X-CSRF-Token': auth.csrfToken,
        'Idempotency-Key': '00000000-0000-4000-8000-000000000000',
      },
      data: { locationId: f.location.id, requestKey: key },
    });
    expect(mismatched.status()).toBe(400);
    let originalResolution = '';
    await admin.route(`**${resolutionPath}`, async (route) => {
      originalResolution = route.request().postData()!;
      expect(route.request().headers()['idempotency-key']).toBe(key);
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      expect((await result.json()).order.id).toBe(committedId);
      await route.abort('failed');
    });
    const resolve = draft.getByRole('button', { name: 'Verifică rezultatul creării', exact: true });
    await resolve.click();
    await expect(resolve).toBeEnabled();
    expect(await pointers(admin)).toEqual(stored);
    await admin.unroute(`**${resolutionPath}`);
    const retry = admin.waitForRequest((r) => r.url().endsWith(resolutionPath));
    const resolved = await submit(admin, resolutionPath, resolve);
    expect((await retry).postData()).toBe(originalResolution);
    expect(resolved).toMatchObject({ status: 'CREATED', order: { id: committedId } });
    expect(await pointers(admin)).toHaveLength(0);
    await expect(admin.getByRole('dialog', { name: 'Comanda #1', exact: true })).toBeVisible();
    expect(
      (await (await api(admin, `/orders?locationId=${f.location.id}`)).json()).orders,
    ).toHaveLength(1);
  } finally {
    await f.dispose();
  }
});

test('creare: retry refuzat de catalog se rezolvă prin retragere durabilă înainte de o cheie nouă', async ({
  browser,
}, info) => {
  const f = await creationFixture(browser);
  const { admin, draft } = f;
  try {
    let original = '';
    await admin.route('**/api/tenant/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      original = route.request().postData()!;
      await route.abort('failed');
    });
    await draft.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    await expect(draft.getByText(/Răspunsul nu este confirmat/)).toBeVisible();
    await admin.unroute('**/api/tenant/orders');
    const locationProductPath = `/catalog/products/${f.product.id}/locations/${f.location.id}`;
    expect(
      (
        await api(
          admin,
          locationProductPath,
          { version: 1, price: '10.0050', enabled: false },
          'PUT',
        )
      ).status(),
    ).toBe(200);
    const rejected = admin.waitForResponse(
      (r) => r.url().endsWith('/api/tenant/orders') && r.request().method() === 'POST',
    );
    await draft.getByRole('button', { name: 'Reîncearcă cererea', exact: true }).click();
    expect((await rejected).status()).toBe(409);
    await expect(draft.getByLabel('Observații comandă', { exact: true })).toBeDisabled();
    const path = '/api/tenant/orders/creation-resolution';
    await admin.route(`**${path}`, async (route) => {
      const result = await route.fetch();
      expect((await result.json()).status).toBe('RETIRED');
      await route.abort('failed');
    });
    const resolve = draft.getByRole('button', { name: 'Verifică rezultatul creării', exact: true });
    await resolve.click();
    await expect(resolve).toBeEnabled();
    await verifyOpaquePointer(admin, JSON.parse(original).requestKey);
    await admin.unroute(`**${path}`);
    const retired = await submit(admin, path, resolve);
    expect(retired.status).toBe('RETIRED');
    await expect(draft.getByText(/Cererea anterioară a fost retrasă definitiv/)).toBeVisible();
    await expect(draft.getByLabel('Observații comandă', { exact: true })).toBeEnabled();
    expect(await pointers(admin)).toHaveLength(0);
    const delayed = await api(admin, '/orders', JSON.parse(original));
    expect(delayed.status()).toBe(409);
    expect((await delayed.json()).code).toBe('ORDER_CREATION_RETIRED');
    expect(
      (
        await api(
          admin,
          locationProductPath,
          { version: 2, price: '10.0050', enabled: true },
          'PUT',
        )
      ).status(),
    ).toBe(200);
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({
      path: info.outputPath('order-creation-retired-360.png'),
      fullPage: true,
    });
    const newRequest = admin.waitForRequest(
      (r) => r.url().endsWith('/api/tenant/orders') && r.method() === 'POST',
    );
    await submit(
      admin,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(JSON.parse((await newRequest).postData()!).requestKey).not.toBe(
      JSON.parse(original).requestKey,
    );
    expect(
      (await (await api(admin, `/orders?locationId=${f.location.id}`)).json()).orders,
    ).toHaveLength(1);
  } finally {
    await f.dispose();
  }
});
