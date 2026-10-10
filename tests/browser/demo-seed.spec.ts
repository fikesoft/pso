import { test, expect } from '@playwright/test';
import { createDatabaseClient, withTenantTransaction } from '../../packages/db/src';
import { seedDemoCatalog } from '../../apps/api/src/app/model/demo-catalog';
import { operationsFixture } from './support/operations-fixture';
import { navigateSection, noOverflow, session } from './support/browser-helpers';

test('seed demo: porții, prețuri și ingrediente vizibile în catalog și comenzi', async ({
  browser,
}, info) => {
  const fixture = await operationsFixture(browser);
  const { admin, location, otherLocation } = fixture;
  const database = createDatabaseClient(process.env.DATABASE_URL!, 2);
  try {
    const identity = await session(admin);
    await withTenantTransaction(
      database,
      { organizationId: identity.user.organizationId, userId: identity.user.id },
      (tx) => seedDemoCatalog(tx, identity.user.organizationId, identity.user.id),
    );
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(admin, 'Catalog');
    for (const name of [
      'Set Enjoy #3 · 32 buc.',
      'Set Enjoy #6 · 48 buc.',
      'Set de exercițiu DEMO · 55 buc.',
      'Cheesecake San Sebastian',
      'Coca Cola · 500 ml',
    ]) {
      await expect(admin.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    const card = admin
      .locator('article')
      .filter({ has: admin.getByRole('heading', { name: 'Set Enjoy #3 · 32 buc.', exact: true }) });
    await expect(card).toContainText('1200 g · 32 bucăți');
    await expect(card).toContainText('616.0000 MDL');
    await card.getByText('Nutriție și ingrediente', { exact: true }).click();
    await expect(card).toContainText('Somon');
    await admin.screenshot({ path: info.outputPath('seed-catalog.png'), fullPage: true });
    await admin
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(otherLocation.id);
    await expect(card).toContainText('616.0000 MDL');
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = admin.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await expect(draft.getByRole('button', { name: /Set Enjoy #3/ })).toBeVisible();
    await admin.setViewportSize({ width: 390, height: 844 });
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('seed-order-390.png'), fullPage: true });
  } finally {
    await database.$disconnect();
    await fixture.dispose();
  }
});
