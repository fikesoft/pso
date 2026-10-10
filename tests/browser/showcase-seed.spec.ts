import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { createDatabaseClient } from '../../packages/db/src/index';
import { createSeedRecord } from '../../scripts/showcase-seed/model/record';
import { runShowcaseSeed } from '../../scripts/showcase-seed/model/run';
import { loginAndActivate, makeAccount } from './support/authentication';
import { api, localOnly, navigateSection, noOverflow, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

test('showcase seed: catalog Nori, comenzi și PIN pe mobil; companie goală cu activare MFA', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  for (const key of ['DATABASE_URL', 'AUTH_DATABASE_URL', 'PLATFORM_DATABASE_URL'])
    if (!['127.0.0.1', 'localhost'].includes(new URL(process.env[key]!).hostname))
      throw new Error('Proba seedului browser acceptă numai DB locală.');
  const clients = {
    runtime: createDatabaseClient(process.env.DATABASE_URL!, 2),
    auth: createDatabaseClient(process.env.AUTH_DATABASE_URL!, 2),
    platform: createDatabaseClient(process.env.PLATFORM_DATABASE_URL!, 1),
  };
  const record = createSeedRecord({
    hostname: '127.0.0.1',
    port: '55432',
    database: '/pos_dev',
    origin: tenantOrigin,
    mode: 'local',
  });
  record.platform.login = `browser-showcase-${randomUUID()}`;
  record.companies[0]!.slug = `browser-full-${randomUUID()}`;
  record.companies[1]!.slug = `browser-empty-${randomUUID()}`;
  const workerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const emptyContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await localOnly(workerContext);
  await localOnly(emptyContext);
  try {
    const result = await runShowcaseSeed(clients, record, 'http://127.0.0.1:4000');
    const worker = await workerContext.newPage();
    await worker.goto(`${tenantOrigin}/c/${record.companies[0]!.slug}/login`);
    await worker.getByLabel('Cod PIN', { exact: true }).fill(record.users[1]!.secret);
    await submit(
      worker,
      '/api/tenant/auth/pin',
      worker.getByRole('button', { name: 'Intră cu cod PIN' }),
    );
    await expect(worker.getByRole('heading', { name: /^Bun venit,/ })).toBeVisible();
    await worker
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(result.references.locationIds[0]!);
    await navigateSection(worker, 'Catalog');
    await expect(
      worker.getByRole('heading', { name: 'Maki Salmon · 8 buc.', exact: true }),
    ).toBeVisible();
    await expect(
      worker.getByRole('heading', { name: 'Philadelphia Classic · DEMO', exact: true }),
    ).toBeVisible();
    await noOverflow(worker);
    await worker.screenshot({ path: info.outputPath('showcase-menu-mobile.png'), fullPage: true });
    await navigateSection(worker, 'Comenzi');
    await expect(worker.getByRole('heading', { name: 'Comenzi', exact: true })).toBeVisible();
    const orders = await (
      await api(worker, `/orders?locationId=${result.references.locationIds[0]}&limit=100`)
    ).json();
    expect(orders.orders).toHaveLength(52);
    expect(orders.orders.some((order: { status: string }) => order.status === 'COMPLETED')).toBe(
      true,
    );
    expect(
      (await api(worker, `/orders?locationId=${result.references.locationIds[1]}`)).status(),
    ).toBe(403);
    await noOverflow(worker);
    await worker.screenshot({
      path: info.outputPath('showcase-orders-mobile.png'),
      fullPage: true,
    });

    const empty = await emptyContext.newPage();
    const account = makeAccount('admin');
    account.initialPassword = record.companies[1]!.admin.password;
    await loginAndActivate(empty, account, { slug: record.companies[1]!.slug, first: true });
    const context = await (await api(empty, '/context')).json();
    expect(context.locations).toHaveLength(0);
    await navigateSection(empty, 'Locații');
    await expect(empty.getByRole('button', { name: 'Adaugă locație' })).toBeVisible();
    await noOverflow(empty);
    await empty.screenshot({ path: info.outputPath('showcase-empty-company.png'), fullPage: true });
  } finally {
    await Promise.all([workerContext.close(), emptyContext.close()]);
    await Promise.all(Object.values(clients).map((client) => client.$disconnect()));
  }
});
