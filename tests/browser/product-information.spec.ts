import { test, expect } from '@playwright/test';
import { createDeliverySandbox } from '../../scripts/delivery-sandbox/model/server';
import { listen, close } from '../support/storefront-fixture';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, localOnly, noOverflow } from './support/browser-helpers';
import { connectWebsite } from './support/website-flow';

test('nutriție și alergeni: declarații exacte, conflict și actualizare website fără pierderea coșului', async ({
  browser,
}, info) => {
  const fixture = await operationsFixture(browser);
  const { admin, location } = fixture;
  const visitorContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await localOnly(visitorContext);
  let storefront: ReturnType<typeof createDeliverySandbox> | undefined;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    const card = admin
      .locator('article')
      .filter({ has: admin.getByRole('heading', { name: 'Cafea sintetică', exact: true }) });
    await card.getByRole('button', { name: 'Editează', exact: true }).click();
    const edit = admin.getByRole('dialog', { name: 'Editează produsul', exact: true });
    await edit.getByText('Nutriție și ingrediente', { exact: true }).click();
    await edit.getByLabel('Baza valorilor nutriționale').selectOption('PER_100G');
    await edit.getByLabel('Energie (kcal)', { exact: true }).fill('120,125');
    await edit.getByLabel('Proteine (g)', { exact: true }).fill('10,005');
    await edit.getByLabel('Grăsimi (g)', { exact: true }).fill('0');
    await edit
      .getByRole('checkbox', { name: 'Lista alergenilor este declarată', exact: true })
      .check();
    await edit.getByLabel('Lista alergenilor', { exact: true }).fill('MILK\nGLUTEN');
    await edit
      .getByRole('checkbox', { name: 'Lista ingredientelor este declarată', exact: true })
      .check();
    await edit.getByLabel('Lista ingredientelor', { exact: true }).fill('Lapte\nCafea');
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('nutrition-form-360.png'), fullPage: true });
    const savedResponse = admin.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/tenant/catalog/products/${product.id}` &&
        response.request().method() === 'PATCH',
    );
    await edit.getByRole('button', { name: 'Salvează datele comune', exact: true }).click();
    const saved = await (await savedResponse).json();
    expect(saved.product).toMatchObject({
      calories: '120.125',
      protein: '10.005',
      fat: '0.000',
      carbs: null,
      allergens: ['MILK', 'GLUTEN'],
      ingredients: ['Lapte', 'Cafea'],
    });
    await expect(edit).not.toBeVisible();
    await card.getByRole('button', { name: 'Editează', exact: true }).click();
    await edit.getByText('Nutriție și ingrediente', { exact: true }).click();
    expect(
      (
        await api(
          admin,
          `/catalog/products/${product.id}`,
          { version: saved.product.version, calories: '121.125' },
          'PATCH',
        )
      ).status(),
    ).toBe(200);
    await edit.getByLabel('Energie (kcal)', { exact: true }).fill('130');
    await edit.getByRole('button', { name: 'Salvează datele comune', exact: true }).click();
    await expect(edit.getByRole('alert')).toContainText('Produsul a fost modificat. Reîncărcați.');
    await edit.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await expect(edit.getByLabel('Energie (kcal)', { exact: true })).toHaveValue('121.125');
    await edit.getByRole('button', { name: 'Anulează', exact: true }).click();
    const issued = await connectWebsite(admin);
    storefront = createDeliverySandbox({
      apiKey: issued.apiKey,
      posOrigin: 'http://127.0.0.1:4000',
    });
    const visitor = await visitorContext.newPage();
    await visitor.goto(await listen(storefront));
    await visitor.getByText('Nutriție și ingrediente', { exact: true }).click();
    await expect(visitor.getByText('Alergeni: MILK, GLUTEN', { exact: true })).toBeVisible();
    await expect(visitor.getByText('Pentru 100 g', { exact: true })).toBeVisible();
    await expect(visitor.getByText('Energie (kcal): 121.125', { exact: true })).toBeVisible();
    await expect(
      visitor.getByText('Carbohidrați (g): Neconfigurat', { exact: true }),
    ).toBeVisible();
    await visitor
      .getByRole('button', { name: 'Adaugă Cafea sintetică în coș', exact: true })
      .click();
    for (const allergens of [[], null]) {
      const current = (
        await (await api(admin, `/catalog/products/${product.id}?locationId=${location.id}`)).json()
      ).product;
      expect(
        (
          await api(
            admin,
            `/catalog/products/${product.id}`,
            { version: current.version, allergens, calories: '0' },
            'PATCH',
          )
        ).status(),
      ).toBe(200);
      await expect(
        visitor.getByText(
          allergens === null
            ? 'Informațiile despre alergeni nu sunt configurate.'
            : 'Nu sunt declarați alergeni.',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(visitor.getByText('Energie (kcal): 0.000', { exact: true })).toBeVisible();
      await expect(visitor.locator('#cart li')).toHaveCount(1);
    }
    await noOverflow(visitor);
    await visitor.screenshot({
      path: info.outputPath('nutrition-website-360.png'),
      fullPage: true,
    });
  } finally {
    await visitorContext.close();
    if (storefront) await close(storefront);
    await fixture.dispose();
  }
});
