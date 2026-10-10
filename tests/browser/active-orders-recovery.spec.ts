import { test, expect } from '@playwright/test';
import { activeOrdersFixture } from './active-orders-setup';
import { submit } from './support/browser-helpers';

test('comenzi active: actualizarea listei păstrează ciorna și cererea necunoscută cu același corp', async ({
  browser,
}) => {
  const f = await activeOrdersFixture(browser);
  try {
    const { operator, draft, panel } = f;
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('DELIVERY');
    await draft.getByLabel('Numele clientului', { exact: true }).fill('Client curent activ');
    await draft.getByLabel('Telefonul clientului', { exact: true }).fill('060121314');
    await draft.getByLabel('Adresa completă', { exact: true }).fill('Adresă curentă activă');
    await operator
      .getByRole('region', { name: 'Catalog operator', exact: true })
      .getByRole('button', { name: /Produs activ/ })
      .click();
    await draft.getByLabel('Cantitate', { exact: true }).fill('2');
    const remote = await f.create();
    const card = panel.getByTestId('active-order-card').filter({
      has: operator.getByRole('heading', { name: `Comanda #${remote.number}`, exact: true }),
    });
    await expect(card).toBeVisible();
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('2');
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toHaveValue(
      'Adresă curentă activă',
    );
    let frozen = '';
    await operator.route('**/api/tenant/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      frozen = route.request().postData()!;
      await route.abort('failed');
    });
    await draft.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    const retry = draft.getByRole('button', { name: 'Reîncearcă cererea', exact: true });
    await expect(retry).toBeEnabled();
    await f.command(remote.id, 'confirm');
    await expect(card).toContainText('Plată rămasă');
    await expect(
      card.getByRole('button', { name: 'Deschide comanda', exact: true }),
    ).toBeDisabled();
    await expect(draft.getByLabel('Cantitate', { exact: true })).toBeDisabled();
    await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue(
      'Client curent activ',
    );
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toHaveValue(
      'Adresă curentă activă',
    );
    await operator.unroute('**/api/tenant/orders');
    const sent = operator.waitForRequest(
      (request) =>
        request.method() === 'POST' && new URL(request.url()).pathname === '/api/tenant/orders',
    );
    const saved = await submit(operator, '/api/tenant/orders', retry);
    expect((await sent).postData()).toBe(frozen);
    expect(saved.order.items[0].quantity).toBe('2.000');
    expect(saved.order.customer.name).toBe('Client curent activ');
    expect(saved.order.deliveryAddress.address).toBe('Adresă curentă activă');
  } finally {
    await f.dispose();
  }
});
