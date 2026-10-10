import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';
import {
  configureProductModifiers,
  changeModifierWithStaleRecovery,
  recoverStaleOrderModifiers,
} from './support/modifier-catalog';

test('modificatori: configurare → alegere obligatorie → preț istoric → bucătărie', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await operationsFixture(browser);
  const { admin, location } = fixture;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const { product, group, option } = await configureProductModifiers(admin, location.id);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = admin.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await draft.getByLabel('Masa', { exact: true }).fill('12');
    await draft.getByRole('button', { name: /Cafea personalizabilă/ }).click();
    const picker = draft.getByRole('region', { name: 'Alege opțiunile', exact: true });
    await expect(
      picker.getByRole('button', { name: 'Adaugă produsul', exact: true }),
    ).toBeDisabled();
    await picker.getByRole('checkbox', { name: /Ovăz sintetic/ }).check();
    await expect(picker).toContainText('11.0050 MDL');
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({
      path: testInfo.outputPath('modifier-picker-360.png'),
      fullPage: true,
    });
    for (const enabled of [false, true]) {
      const current = (
        await (await api(admin, `/catalog/products/${product.id}?locationId=${location.id}`)).json()
      ).product;
      expect(
        (
          await api(
            admin,
            `/catalog/products/${product.id}/locations/${location.id}`,
            { version: current.locationVersion, price: current.price, enabled },
            'PUT',
          )
        ).status(),
      ).toBe(200);
      const confirm = picker.getByRole('button', { name: 'Adaugă produsul', exact: true });
      if (enabled) await expect(confirm).toBeEnabled();
      else await expect(confirm).toBeDisabled();
      await expect(picker.getByRole('checkbox', { name: /Ovăz sintetic/ })).toBeChecked();
      await expect(draft.getByLabel('Masa', { exact: true })).toHaveValue('12');
    }
    await picker.getByRole('button', { name: 'Adaugă produsul', exact: true }).click();
    await recoverStaleOrderModifiers(admin, draft, group.id, option.id, option.version);
    const created = await submit(
      admin,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(created.order.total).toBe('11.01');
    expect(created.order.items[0]).toMatchObject({
      baseUnitPrice: '10.0000',
      unitPrice: '11.0050',
      modifierGroups: [
        {
          groupName: 'Lapte sintetic',
          options: [{ optionName: 'Ovăz sintetic', extraPrice: '1.0050' }],
        },
      ],
    });
    await admin.keyboard.press('Escape');
    await admin.setViewportSize({ width: 1440, height: 900 });
    await changeModifierWithStaleRecovery(admin, group.id, option.id, location.id);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Editează', exact: true }).click();
    const edit = admin.getByRole('dialog', { name: 'Editează ciorna #1', exact: true });
    await expect(edit).toContainText('Ovăz sintetic');
    await expect(edit).not.toContainText('Ovăz actualizat');
    await edit.getByLabel('Cantitate', { exact: true }).fill('2');
    const patch = admin.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/tenant/orders/${created.order.id}` &&
        response.request().method() === 'PATCH',
    );
    await edit.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    expect((await patch).status()).toBe(200);
    const details = admin.getByRole('dialog', { name: 'Comanda #1', exact: true });
    await expect(details).toContainText('22.01 MDL');
    const send = await submit(
      admin,
      `/api/tenant/orders/${created.order.id}/send`,
      details.getByRole('button', { name: 'Trimite la bucătărie', exact: true }),
    );
    expect(send.order.status).toBe('CONFIRMED');
    await expect(details.getByRole('button', { name: 'Reîncarcă', exact: true })).toBeEnabled();
    await admin.keyboard.press('Escape');
    await expect(details).not.toBeVisible();
    await navigateSection(admin, 'Bucătărie');
    const ticket = admin
      .locator('article')
      .filter({ has: admin.getByRole('heading', { name: 'Comanda #1', exact: true }) });
    await expect(ticket).toContainText('Lapte sintetic');
    await expect(ticket).toContainText('Ovăz sintetic');
    await expect(ticket).not.toContainText('Ovăz actualizat');
    await expect(ticket).not.toContainText('MDL');
    await admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(admin);
    await admin.screenshot({
      path: testInfo.outputPath('modifier-kitchen-360.png'),
      fullPage: true,
    });
    const persisted = await (await api(admin, `/orders/${created.order.id}`)).json();
    expect(persisted.order.total).toBe('22.01');
    expect(persisted.order.items[0].id).toBe(created.order.items[0].id);
    expect(persisted.order.items[0].productId).toBe(product.id);
  } finally {
    await fixture.dispose();
  }
});
