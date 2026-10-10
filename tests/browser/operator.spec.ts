import { test, expect } from '@playwright/test';
import { operatorFixture } from './operator-setup';
import { api, navigateSection, noOverflow, submit } from './support/browser-helpers';

test('operator: categorii și modificatori în comandă persistentă, creare PIN și trimitere reală la bucătărie', async ({
  browser,
}, info) => {
  const f = await operatorFixture(browser);
  const { operator, admin, location, coffee } = f;
  try {
    const catalog = operator.getByRole('region', { name: 'Catalog operator', exact: true });
    const draft = operator.getByRole('region', { name: 'Comanda curentă', exact: true });
    await expect(catalog).toBeVisible();
    await expect(draft).toBeVisible();
    await expect(
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    ).toBeInViewport({ ratio: 1 });
    expect((await catalog.boundingBox())!.x).toBeLessThan((await draft.boundingBox())!.x);
    const category = catalog.getByRole('button', { name: 'Băuturi operator', exact: true });
    await category.focus();
    await operator.keyboard.press('Enter');
    await expect(category).toHaveAttribute('aria-pressed', 'true');
    await expect(catalog.getByRole('button', { name: /Gustare operator/ })).toHaveCount(0);
    const extraProducts = catalog.getByRole('button', { name: /Produs catalog/ });
    await expect(extraProducts).toHaveCount(24);
    await extraProducts.last().scrollIntoViewIfNeeded();
    await expect(extraProducts.last()).toBeInViewport({ ratio: 1 });
    await expect(
      draft.getByRole('heading', { name: 'Comanda curentă', exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await catalog.getByRole('button', { name: /Cafea operator/ }).focus();
    await operator.keyboard.press('Enter');
    const picker = operator.getByRole('dialog', { name: 'Cafea operator', exact: true });
    await expect(picker).toBeVisible();
    await expect(
      picker.getByRole('button', { name: 'Adaugă produsul', exact: true }),
    ).toBeDisabled();
    for (const size of [
      { width: 1440, height: 900 },
      { width: 360, height: 800 },
    ]) {
      await operator.setViewportSize(size);
      await expect(
        picker.getByRole('button', { name: 'Adaugă produsul', exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await expect(picker.getByRole('checkbox', { name: /Ovăz operator/ })).toBeInViewport({
        ratio: 1,
      });
      await noOverflow(operator);
      await operator.screenshot({
        path: info.outputPath(`operator-modifier-${size.width}.png`),
        fullPage: false,
      });
    }
    await operator.setViewportSize({ width: 1440, height: 900 });
    await picker.getByRole('checkbox', { name: /Ovăz operator/ }).check();
    await picker.getByRole('button', { name: 'Adaugă produsul', exact: true }).click();
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await draft.getByLabel('Canalul comenzii', { exact: true }).selectOption('PHONE');
    await draft.getByLabel('Numele clientului', { exact: true }).fill('Client operator sintetic');
    await draft.getByLabel('Telefonul clientului', { exact: true }).fill('060445566');
    await draft.getByLabel('Cantitate', { exact: true }).fill('2');
    await draft.getByLabel('Observație produs', { exact: true }).fill('Fără zahăr');
    await draft.getByLabel('Observații comandă', { exact: true }).fill('Notă internă operator');
    await catalog.getByLabel('Caută produse', { exact: true }).fill('Cafea');
    await catalog.getByLabel('Caută produse', { exact: true }).focus();
    const accidentalSave = operator
      .waitForRequest(
        (request) => request.url().endsWith('/api/tenant/orders') && request.method() === 'POST',
        { timeout: 500 },
      )
      .then(
        () => true,
        () => false,
      );
    await operator.keyboard.press('Enter');
    expect(await accidentalSave).toBe(false);
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('2');
    await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue(
      'Client operator sintetic',
    );
    await catalog.getByLabel('Caută produse', { exact: true }).fill('');
    await expect(extraProducts).toHaveCount(24);
    await expect(
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await noOverflow(operator);
    await operator.screenshot({
      path: info.outputPath('operator-workspace-1440.png'),
      fullPage: false,
    });
    const created = await submit(
      operator,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    expect(created.order).toMatchObject({
      source: 'PHONE',
      serviceType: 'PICKUP',
      total: '22.01',
      customer: { name: 'Client operator sintetic', phone: '060445566' },
    });
    expect(created.order.items[0]).toMatchObject({
      productId: coffee.id,
      quantity: '2.000',
      note: 'Fără zahăr',
      modifierGroups: [{ groupName: 'Lapte operator', options: [{ optionName: 'Ovăz operator' }] }],
    });
    const details = operator.getByRole('dialog', { name: 'Comanda #1', exact: true });
    await expect(details).toBeVisible();
    const sent = await submit(
      operator,
      `/api/tenant/orders/${created.order.id}/send`,
      details.getByRole('button', { name: 'Trimite la bucătărie', exact: true }),
    );
    expect(sent.order).toMatchObject({
      id: created.order.id,
      status: 'CONFIRMED',
      kitchenStatus: 'QUEUED',
      version: 2,
    });
    await operator.keyboard.press('Escape');
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveCount(0);
    await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue('');
    await operator.reload();
    await operator
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(location.id);
    await navigateSection(operator, 'Comenzi');
    await operator.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    await expect(details).toContainText('Ovăz operator');
    await expect(details).toContainText('22.01 MDL');
    const stored = (await (await api(admin, `/orders/${created.order.id}`)).json()).order;
    expect(stored).toMatchObject({
      id: created.order.id,
      version: 2,
      source: 'PHONE',
      kitchenStatus: 'QUEUED',
    });
    const tickets = await (await api(admin, `/kitchen/tickets?locationId=${location.id}`)).json();
    const ticket = tickets.tickets.find(
      (value: { orderId: string }) => value.orderId === created.order.id,
    );
    expect(ticket).toBeDefined();
    expect(JSON.stringify(ticket)).toContain('Fără zahăr');
    expect(JSON.stringify(ticket)).not.toMatch(
      /Client operator sintetic|060445566|Notă internă operator/,
    );
  } finally {
    await f.dispose();
  }
});

test('operator: doar creare, ciornă păstrată între panouri responsive și golită la schimbarea locației', async ({
  browser,
}, info) => {
  const f = await operatorFixture(browser, false);
  const { operator, admin, otherLocation } = f;
  try {
    const catalog = operator.getByRole('region', { name: 'Catalog operator', exact: true });
    const draft = operator.getByRole('region', { name: 'Comanda curentă', exact: true });
    const panels = operator.getByRole('group', { name: 'Operator', exact: true });
    await catalog.getByRole('button', { name: 'Gustări operator', exact: true }).click();
    await catalog.getByRole('button', { name: /Gustare operator/ }).click();
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await draft.getByLabel('Numele clientului', { exact: true }).fill('Client numai Centru');
    await draft.getByLabel('Cantitate', { exact: true }).fill('3');
    const save = draft.getByRole('button', { name: 'Salvează ciorna', exact: true });
    for (const size of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ]) {
      await operator.setViewportSize(size);
      if (size.width <= 1100) {
        await panels.getByRole('button', { name: 'Produse', exact: true }).click();
        await expect(catalog.getByRole('button', { name: /Gustare operator/ })).toBeVisible();
        await panels.getByRole('button', { name: /^Comanda curentă/ }).click();
      }
      await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveValue('3');
      await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue(
        'Client numai Centru',
      );
      await save.scrollIntoViewIfNeeded();
      await save.focus();
      await expect(save).toBeFocused();
      await expect(save).toBeEnabled();
      const box = (await save.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      await noOverflow(operator);
      if (size.width === 360) {
        await operator.screenshot({
          path: info.outputPath('operator-action-360.png'),
          fullPage: false,
        });
      }
      await operator.screenshot({
        path: info.outputPath(`operator-draft-${size.width}.png`),
        fullPage: true,
      });
    }
    await operator
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(otherLocation.id);
    const northern = catalog.getByRole('button', { name: /Produs numai Nord/ });
    await expect(northern).toBeEnabled();
    await expect(northern).toContainText('22.0000 MDL');
    const southern = catalog.getByRole('button', { name: /Gustare operator/ });
    if (await southern.count()) await expect(southern).toBeDisabled();
    await panels.getByRole('button', { name: /^Comanda curentă/ }).click();
    await expect(draft.getByLabel('Numele clientului', { exact: true })).toHaveValue('');
    await expect(draft.getByLabel('Cantitate', { exact: true })).toHaveCount(0);
    await panels.getByRole('button', { name: 'Produse', exact: true }).click();
    await northern.click();
    await panels.getByRole('button', { name: /^Comanda curentă/ }).click();
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    const response = operator.waitForResponse(
      (r) => r.url().endsWith('/api/tenant/orders') && r.request().method() === 'POST',
    );
    await save.focus();
    await operator.keyboard.press('Enter');
    const saved = await response;
    expect(saved.status()).toBe(200);
    const { order } = await saved.json();
    expect(order).toMatchObject({ locationId: otherLocation.id, total: '22.00' });
    expect(order).not.toHaveProperty('customer');
    await expect(operator.getByRole('dialog')).toHaveCount(0);
    expect(f.reads).toEqual([]);
    const persisted = (await (await api(admin, `/orders/${order.id}`)).json()).order;
    expect(persisted).toMatchObject({
      locationId: otherLocation.id,
      customer: null,
      total: '22.00',
    });
    expect(persisted.items[0].productId).toBe(f.foreign.id);
  } finally {
    await f.dispose();
  }
});
