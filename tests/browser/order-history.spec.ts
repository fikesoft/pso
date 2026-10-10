import { completePacking } from './support/complete-packing';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('comandă: Telefon și Ridicare, cote istorice distincte în ciornă și bon', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser);
  const { admin, location } = f;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    const rate = await api(
      admin,
      `/catalog/products/${product.id}`,
      { version: 1, taxRate: '20.125' },
      'PATCH',
    );
    expect(rate.status()).toBe(200);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const create = admin.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await create.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await create.getByLabel('Canalul comenzii', { exact: true }).selectOption('PHONE');
    await expect(create.getByLabel('Masa', { exact: true })).toHaveCount(0);
    await create.getByRole('button', { name: /Cafea sintetică/ }).click();
    const saved = await submit(
      admin,
      '/api/tenant/orders',
      create.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(saved.order).toMatchObject({ source: 'PHONE', serviceType: 'PICKUP' });
    const details = admin.getByRole('dialog', { name: 'Comanda #1', exact: true });
    await expect(details).toContainText('Telefon');
    await expect(details).toContainText('Ridicare');
    await expect(details).toContainText('Cotă salvată: 20.1250%');
    await admin.keyboard.press('Escape');
    const zero = await api(
      admin,
      `/catalog/products/${product.id}`,
      { version: 2, taxRate: '0' },
      'PATCH',
    );
    expect(zero.status()).toBe(200);
    await admin.getByRole('button', { name: 'Editează', exact: true }).click();
    const edit = admin.getByRole('dialog', { name: 'Editează ciorna #1', exact: true });
    await expect(edit.getByLabel('Canalul comenzii', { exact: true })).toHaveCount(0);
    await expect(edit).toContainText('Cotă salvată: 20.1250%');
    await edit.getByLabel('Cantitate', { exact: true }).fill('2');
    await edit.getByRole('button', { name: /Cafea sintetică/ }).click();
    const changedResponse = admin.waitForResponse(
      (response) =>
        response.url().endsWith(`/orders/${saved.order.id}`) &&
        response.request().method() === 'PATCH',
    );
    await edit.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    const changed = await changedResponse;
    expect(changed.status()).toBe(200);
    const { order } = await changed.json();
    expect(order.items.map((item: { taxRateSnapshot: string }) => item.taxRateSnapshot)).toEqual([
      '20.1250',
      '0.0000',
    ]);
    expect(order.total).toBe('30.02');
    await expect(details).toContainText('Cotă salvată: 0.0000%');
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('order-history-360.png'), fullPage: true });
    await admin.keyboard.press('Escape');
    const sent = await api(admin, `/orders/${order.id}/send`, {
      version: order.version,
      requestKey: randomUUID(),
    });
    expect(sent.status()).toBe(200);
    let { ticket } = await sent.json();
    for (const status of ['PREPARING', 'READY']) {
      const updated = await api(
        admin,
        `/kitchen/tickets/${ticket.id}`,
        { version: ticket.version, status },
        'PATCH',
      );
      expect(updated.status()).toBe(200);
      ticket = (await updated.json()).ticket;
    }
    const ready = await completePacking(admin, order.id);
    const paid = await api(admin, `/orders/${order.id}/checkout/manual`, {
      version: ready.version,
      requestKey: randomUUID(),
      method: 'CARD',
      cashShiftId: (await f.cashShift()).id,
      confirmed: true,
    });
    expect(paid.status()).toBe(200);
    await admin.getByRole('button', { name: 'Reîncarcă', exact: true }).click();
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    const receipt = admin.getByRole('dialog', {
      name: 'Dovadă de încasare · nefiscală',
      exact: true,
    });
    await expect(receipt).toContainText('Ridicare');
    await expect(receipt.getByLabel('Document', { exact: true })).toContainText(
      'Cotă salvată: 20.1250%',
    );
    await expect(receipt.getByLabel('Document', { exact: true })).toContainText(
      'Cotă salvată: 0.0000%',
    );
    const downloading = admin.waitForEvent('download');
    await receipt.getByRole('button', { name: 'Descarcă TXT', exact: true }).click();
    const download = await downloading;
    const path = info.outputPath('receipt-tax-history.txt');
    await download.saveAs(path);
    const text = await readFile(path, 'utf8');
    expect(text).toContain('20.1250%');
    expect(text).toContain('0.0000%');
    expect(text).toContain('30.02 MDL');
    await noOverflow(admin);
    await admin.screenshot({
      path: info.outputPath('receipt-tax-history-360.png'),
      fullPage: true,
    });
  } finally {
    await f.dispose();
  }
});
