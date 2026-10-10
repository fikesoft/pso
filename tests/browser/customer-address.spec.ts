import { test, expect } from '@playwright/test';
import {
  customerAddressFixture,
  selectAddressCustomer,
  noAddressPersistence,
  addressPointers,
} from './customer-address-setup';
import { api, noOverflow, submit } from './support/browser-helpers';

test('adrese: adresa manuală nu creează agendă, selecția este explicită și schimbarea serviciului sau clientului elimină destinația legată', async ({
  browser,
}, info) => {
  const f = await customerAddressFixture(browser);
  const { operator, draft } = f;
  try {
    await operator
      .getByRole('region', { name: 'Catalog operator', exact: true })
      .getByRole('button', { name: /Produs adrese/ })
      .click();
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('DELIVERY');
    const address = 'Strada Privată 81, apartament 12';
    const instructions = 'Sună o singură dată';
    await draft.getByLabel('Adresa completă', { exact: true }).fill(address);
    await draft.getByLabel('Instrucțiuni de livrare', { exact: true }).fill(instructions);
    const manual = await submit(
      operator,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(manual.order).toMatchObject({
      addressRef: null,
      customerRef: null,
      deliveryAddress: { address, instructions },
    });
    expect(
      (await (await api(f.admin, `${f.path}?locationId=${f.location.id}`)).json()).addresses,
    ).toEqual([]);
    await operator.keyboard.press('Escape');
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('DELIVERY');
    await selectAddressCustomer(f);
    await draft.getByLabel('Adresa completă', { exact: true }).fill(address);
    await draft.getByLabel('Instrucțiuni de livrare', { exact: true }).fill(instructions);
    await draft.getByLabel('Eticheta adresei', { exact: true }).fill('Acasă privată');
    await operator.route(`**/api/tenant${f.path}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Acces interzis', code: 'REQUEST_REJECTED' }),
      });
    });
    const rejected = operator.waitForResponse(
      (response) => response.url().endsWith(f.path) && response.status() === 403,
    );
    await draft.getByRole('button', { name: 'Salvează adresa în agendă', exact: true }).click();
    await rejected;
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toBeEnabled();
    expect(await addressPointers(operator)).toEqual([]);
    await expect(
      draft.getByRole('button', { name: 'Verifică rezultatul adresei', exact: true }),
    ).toHaveCount(0);
    await operator.unroute(`**/api/tenant${f.path}`);
    const created = await submit(
      operator,
      `/api/tenant${f.path}`,
      draft.getByRole('button', { name: 'Salvează adresa în agendă', exact: true }),
    );
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toBeEnabled();
    const book = draft.getByRole('region', { name: 'Adresele clientului', exact: true });
    await book.getByRole('button', { name: 'Selectează adresa', exact: true }).click();
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toBeDisabled();
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('DELIVERY');
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toHaveValue('');
    await book.getByRole('button', { name: 'Selectează adresa', exact: true }).click();
    await draft.getByRole('button', { name: 'Folosește contact manual', exact: true }).click();
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toHaveValue('');
    await selectAddressCustomer(f);
    await book.getByRole('button', { name: 'Selectează adresa', exact: true }).click();
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        f.post(f.path, {
          locationId: f.location.id,
          requestKey: crypto.randomUUID(),
          address: `Destinație pentru verificarea agendei lungi ${index}`,
        }),
      ),
    );
    await book.getByRole('button', { name: 'Reîncarcă adresele', exact: true }).click();
    await expect(book.getByRole('article')).toHaveCount(13);
    await operator
      .getByRole('region', { name: 'Catalog operator', exact: true })
      .getByRole('button', { name: /Produs adrese/ })
      .click();
    await draft.getByLabel('Adresa completă', { exact: true }).scrollIntoViewIfNeeded();
    const save = draft.getByRole('button', { name: 'Salvează ciorna', exact: true });
    await expect
      .poll(async () => {
        const box = await save.boundingBox();
        return !!box && box.y >= 0 && box.y + box.height <= 900;
      })
      .toBe(true);
    await noOverflow(operator);
    await operator.screenshot({
      path: info.outputPath('customer-address-selected-1440.png'),
      fullPage: false,
    });
    await operator.setViewportSize({ width: 360, height: 800 });
    await operator
      .getByRole('group', { name: 'Operator', exact: true })
      .getByRole('button', { name: /^Comanda curentă/ })
      .click();
    await draft.getByLabel('Adresa completă', { exact: true }).scrollIntoViewIfNeeded();
    await noOverflow(operator);
    await operator.screenshot({
      path: info.outputPath('customer-address-selected-360.png'),
      fullPage: false,
    });
    const selected = await submit(
      operator,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(selected.order).toMatchObject({
      customerRef: { id: f.customer.id, version: 1 },
      addressRef: { id: created.address.id, version: 1 },
      deliveryAddress: { address, instructions },
    });
    await noAddressPersistence(f, [address, instructions, 'Acasă privată', f.customer.phone]);
  } finally {
    await f.dispose();
  }
});
