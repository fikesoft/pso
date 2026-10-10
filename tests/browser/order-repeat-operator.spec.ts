import { test, expect } from '@playwright/test';
import { orderRepeatFixture } from './order-repeat-setup';
import { selectAddressCustomer } from './customer-address-setup';
import { api, submit } from './support/browser-helpers';

test('repetare: ultima comandă finalizată înlocuiește doar produsele ciornei noi și nu este disponibilă în editarea unei comenzi persistate', async ({
  browser,
}) => {
  const f = await orderRepeatFixture(browser);
  const { operator, draft } = f;
  try {
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('DELIVERY');
    await selectAddressCustomer(f);
    await draft.getByLabel('Canalul comenzii', { exact: true }).selectOption('POS');
    await draft.getByLabel('Adresa completă', { exact: true }).fill('Destinația curentă păstrată');
    await draft.getByLabel('Instrucțiuni de livrare', { exact: true }).fill('Indicația curentă');
    await draft.getByLabel('Observații comandă', { exact: true }).fill('Nota curentă păstrată');
    await operator
      .getByRole('region', { name: 'Catalog operator', exact: true })
      .getByRole('button', { name: /Produs istoric oprit/ })
      .click();
    const latest = draft.getByRole('region', { name: 'Ultima comandă finalizată', exact: true });
    const response = operator.waitForResponse((result) =>
      result.url().includes(`/customers/${f.customer.id}/last-order?`),
    );
    await latest
      .getByRole('button', { name: 'Caută ultima comandă finalizată', exact: true })
      .click();
    expect((await (await response).json()).order.id).toBe(f.source.id);
    await latest.getByRole('button', { name: 'Repetă comanda', exact: true }).click();
    const preview = operator.getByRole('dialog', {
      name: `Previzualizare repetare #${f.source.number}`,
      exact: true,
    });
    await expect(preview.getByTestId('repeat-line')).toHaveCount(2);
    await preview.getByRole('button', { name: 'Înapoi la ciornă', exact: true }).click();
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveCount(1);
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('1');
    await latest.getByRole('button', { name: 'Repetă comanda', exact: true }).click();
    const apply = preview.getByRole('button', {
      name: 'Folosește produsele în ciornă',
      exact: true,
    });
    await expect(apply).toBeDisabled();
    await preview
      .getByRole('checkbox', {
        name: 'Confirm înlocuirea produselor din ciorna curentă',
        exact: true,
      })
      .check();
    await apply.click();
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveCount(2);
    await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue(
      f.customer.name,
    );
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toHaveValue(
      'Destinația curentă păstrată',
    );
    await expect(draft.getByLabel('Instrucțiuni de livrare', { exact: true })).toHaveValue(
      'Indicația curentă',
    );
    await expect(draft.getByLabel('Observații comandă', { exact: true })).toHaveValue(
      'Nota curentă păstrată',
    );
    await expect(draft.getByLabel('Tip de servire', { exact: true })).toHaveValue('DELIVERY');
    await expect(draft.getByLabel('Canalul comenzii', { exact: true })).toHaveValue('POS');
    const save = draft.getByRole('button', { name: 'Salvează ciorna', exact: true });
    await expect
      .poll(async () => {
        const box = await save.boundingBox();
        return !!box && box.y >= 0 && box.y + box.height <= 900;
      })
      .toBe(true);
    const saved = await submit(
      operator,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(saved.order).toMatchObject({
      source: 'POS',
      serviceType: 'DELIVERY',
      notes: 'Nota curentă păstrată',
      customerRef: { id: f.customer.id, version: 1 },
      deliveryAddress: {
        address: 'Destinația curentă păstrată',
        instructions: 'Indicația curentă',
      },
    });
    const details = operator.getByRole('dialog', {
      name: `Comanda #${saved.order.number}`,
      exact: true,
    });
    await expect(details.getByRole('button', { name: 'Repetă comanda', exact: true })).toHaveCount(
      0,
    );
    await details.getByRole('button', { name: 'Editează ciorna', exact: true }).click();
    const edit = operator.getByRole('dialog', {
      name: `Editează ciorna #${saved.order.number}`,
      exact: true,
    });
    await expect(
      edit.getByRole('region', { name: 'Ultima comandă finalizată', exact: true }),
    ).toHaveCount(0);
    await expect(edit.getByRole('button', { name: 'Repetă comanda', exact: true })).toHaveCount(0);
    expect((await (await api(f.admin, `/orders/${f.source.id}`)).json()).order).toEqual(f.source);
  } finally {
    await f.dispose();
  }
});
