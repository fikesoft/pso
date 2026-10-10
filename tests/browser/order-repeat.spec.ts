import { test, expect } from '@playwright/test';
import { orderRepeatFixture, openRepeatDetails } from './order-repeat-setup';
import { api, noOverflow, submit } from './support/browser-helpers';

test('repetare: previzualizarea cere eliminarea și reconfigurarea explicită înainte de o ciornă nouă la preț curent fără metadatele sursei', async ({
  browser,
}, info) => {
  const f = await orderRepeatFixture(browser);
  const { operator } = f;
  try {
    await f.changeCatalog();
    const details = await openRepeatDetails(f);
    await details.getByRole('button', { name: 'Repetă comanda', exact: true }).click();
    const preview = operator.getByRole('dialog', {
      name: `Previzualizare repetare #${f.source.number}`,
      exact: true,
    });
    const apply = preview.getByRole('button', {
      name: 'Folosește produsele în ciornă',
      exact: true,
    });
    await expect(preview.getByTestId('repeat-line')).toHaveCount(2);
    await expect(apply).toBeDisabled();
    await expect(preview).not.toContainText('Adresă istorică de exclus');
    await expect(preview).not.toContainText(f.customer.phone);
    const stopped = preview.getByTestId('repeat-line').filter({ hasText: 'Produs istoric oprit' });
    await expect(stopped).toContainText('Produs oprit în această locație');
    await stopped.getByRole('button', { name: 'Elimină din repetare', exact: true }).click();
    await expect(apply).toBeDisabled();
    const repairRow = preview.getByTestId('repeat-line').filter({ hasText: 'Produs adrese' });
    await repairRow.getByRole('button', { name: 'Reconfigurează produsul', exact: true }).click();
    const picker = operator.getByRole('dialog', { name: 'Reconfigurează produsul', exact: true });
    await picker.getByRole('checkbox', { name: /Opțiune păstrată/ }).check();
    await picker.getByRole('checkbox', { name: /Opțiune obligatorie nouă/ }).check();
    await picker.getByRole('button', { name: 'Adaugă produsul', exact: true }).click();
    await expect(repairRow).toContainText('Preț unitar curent: 18.0000 MDL');
    await expect(apply).toBeEnabled();
    await apply.scrollIntoViewIfNeeded();
    await noOverflow(operator);
    await operator.screenshot({
      path: info.outputPath('order-repeat-preview-1440.png'),
      fullPage: false,
    });
    await operator.setViewportSize({ width: 360, height: 800 });
    await apply.scrollIntoViewIfNeeded();
    await noOverflow(operator);
    await operator.screenshot({
      path: info.outputPath('order-repeat-preview-360.png'),
      fullPage: false,
    });
    await apply.click();
    const draft = operator.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue('');
    await expect(draft.getByLabel('Telefonul clientului', { exact: true })).toHaveValue('');
    await expect(draft.getByLabel('Observații comandă', { exact: true })).toHaveValue('');
    await expect(draft.getByLabel('Canalul comenzii', { exact: true })).toHaveValue('POS');
    await expect(draft.getByLabel('Tip de servire', { exact: true })).toHaveValue('DINE_IN');
    await expect(draft.getByLabel('Masa', { exact: true })).toHaveValue('');
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    const requested = operator.waitForRequest(
      (request) => request.url().endsWith('/api/tenant/orders') && request.method() === 'POST',
    );
    const saved = await submit(
      operator,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(saved.order).toMatchObject({
      total: '36.00',
      status: 'DRAFT',
      source: 'POS',
      customerRef: null,
      addressRef: null,
    });
    expect(saved.order.id).not.toBe(f.source.id);
    expect(saved.order.items).toHaveLength(1);
    expect(saved.order.items[0].note).toBe('Notă istorică pe linie');
    const body = (await requested).postDataJSON();
    expect(body.items[0]).not.toHaveProperty('id');
    expect(body.items[0]).not.toHaveProperty('sourceUpsellOfferId');
    expect((await (await api(f.admin, `/orders/${f.source.id}`)).json()).order).toEqual(f.source);
  } finally {
    await f.dispose();
  }
});
