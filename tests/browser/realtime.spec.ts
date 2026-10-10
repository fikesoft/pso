import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow } from './support/browser-helpers';

test('stop-lista se propagă live între două ferestre și păstrează ciorna POS', async ({
  browser,
}, testInfo) => {
  const fixture = await operationsFixture(browser);
  const { admin, location } = fixture;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    const operator = await admin.context().newPage();
    await operator.addInitScript(() => {
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          const disconnect = () => this.close();
          window.addEventListener('test:disconnect-live', disconnect);
          this.addEventListener('close', () =>
            window.removeEventListener('test:disconnect-live', disconnect),
          );
        }
      };
    });
    await operator.goto(admin.url());
    await operator
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(location.id);
    await expect(
      operator.getByText('Catalog actualizat în timp real', { exact: true }),
    ).toBeVisible();
    await navigateSection(operator, 'Comenzi');
    await operator.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = operator.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await draft.getByLabel('Masa', { exact: true }).fill('21');
    const add = draft.getByRole('button', { name: /Cafea sintetică/ });
    await add.click();
    const current = (
      await (await api(admin, `/catalog/products/${product.id}?locationId=${location.id}`)).json()
    ).product;
    const stopped = await api(
      admin,
      `/catalog/products/${product.id}/locations/${location.id}`,
      {
        version: current.locationVersion,
        price: current.price,
        enabled: false,
      },
      'PUT',
    );
    expect(stopped.status()).toBe(200);
    await expect(add).toBeDisabled({ timeout: 5_000 });
    await expect(draft.getByLabel('Masa', { exact: true })).toHaveValue('21');
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('1');
    await operator.setViewportSize({ width: 360, height: 800 });
    await noOverflow(operator);
    await operator.screenshot({
      path: testInfo.outputPath('realtime-stop-list-360.png'),
      fullPage: true,
    });
    await operator.evaluate(() => window.dispatchEvent(new Event('test:disconnect-live')));
    const stoppedProduct = (await stopped.json()).product;
    expect(
      (
        await api(
          admin,
          `/catalog/products/${product.id}/locations/${location.id}`,
          {
            version: stoppedProduct.locationVersion,
            price: current.price,
            enabled: true,
          },
          'PUT',
        )
      ).status(),
    ).toBe(200);
    await expect(add).toBeEnabled({ timeout: 5_000 });
    await expect(
      operator.getByText('Catalog actualizat în timp real', { exact: true }),
    ).toBeVisible();
    await expect(draft.getByLabel('Masa', { exact: true })).toHaveValue('21');
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('1');
  } finally {
    await fixture.dispose();
  }
});
