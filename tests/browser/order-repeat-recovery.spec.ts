import { test, expect } from '@playwright/test';
import { orderRepeatFixture } from './order-repeat-setup';
import { selectAddressCustomer, addressPointers } from './customer-address-setup';
import { submit } from './support/browser-helpers';

test('repetare: cererile de comandă și adresă neconfirmate blochează înlocuirea produselor și păstrează proprietarul reîncercării', async ({
  browser,
}) => {
  const f = await orderRepeatFixture(browser);
  const { operator, draft } = f;
  try {
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await selectAddressCustomer(f);
    await operator
      .getByRole('region', { name: 'Catalog operator', exact: true })
      .getByRole('button', { name: /Produs istoric oprit/ })
      .click();
    const latest = draft.getByRole('region', { name: 'Ultima comandă finalizată', exact: true });
    await latest
      .getByRole('button', { name: 'Caută ultima comandă finalizată', exact: true })
      .click();
    const repeat = latest.getByRole('button', { name: 'Repetă comanda', exact: true });
    await expect(repeat).toBeEnabled();
    let body = '';
    await operator.route('**/api/tenant/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      body = route.request().postData()!;
      await route.abort('failed');
    });
    await draft.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    const retry = draft.getByRole('button', { name: 'Reîncearcă cererea', exact: true });
    await expect(retry).toBeEnabled();
    await expect(repeat).toBeDisabled();
    await expect(
      latest.getByRole('button', { name: 'Caută ultima comandă finalizată', exact: true }),
    ).toBeDisabled();
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('1');
    await expect(draft.getByLabel('Cantitate', { exact: true })).toBeDisabled();
    await expect(operator.getByRole('dialog', { name: /^Previzualizare repetare/ })).toHaveCount(0);
    await operator.unroute('**/api/tenant/orders');
    const requested = operator.waitForRequest(
      (request) => request.url().endsWith('/api/tenant/orders') && request.method() === 'POST',
    );
    const created = await submit(operator, '/api/tenant/orders', retry);
    expect((await requested).postData()).toBe(body);
    expect(created.order.items).toHaveLength(1);
    await operator.keyboard.press('Escape');
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('DELIVERY');
    await selectAddressCustomer(f);
    await draft
      .getByLabel('Adresa completă', { exact: true })
      .fill('Destinație necunoscută de păstrat');
    await latest
      .getByRole('button', { name: 'Caută ultima comandă finalizată', exact: true })
      .click();
    await expect(repeat).toBeEnabled();
    await operator.route(`**/api/tenant${f.path}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.abort('failed');
    });
    await draft.getByRole('button', { name: 'Salvează adresa în agendă', exact: true }).click();
    const resolve = draft.getByRole('button', { name: 'Verifică rezultatul adresei', exact: true });
    await expect(resolve).toBeEnabled();
    const pointer = await addressPointers(operator);
    expect(pointer).toHaveLength(1);
    await expect(repeat).toBeDisabled();
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toHaveValue(
      'Destinație necunoscută de păstrat',
    );
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toBeDisabled();
    await expect(operator.getByRole('dialog', { name: /^Previzualizare repetare/ })).toHaveCount(0);
    expect(await addressPointers(operator)).toEqual(pointer);
    await operator.unroute(`**/api/tenant${f.path}`);
    const retired = await submit(operator, `/api/tenant${f.path}/creation-resolution`, resolve);
    expect(retired.status).toBe('RETIRED');
    await expect(repeat).toBeEnabled();
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toHaveValue(
      'Destinație necunoscută de păstrat',
    );
  } finally {
    await f.dispose();
  }
});
