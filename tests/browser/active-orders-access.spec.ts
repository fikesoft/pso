import { test, expect } from '@playwright/test';
import { activeOrdersFixture } from './active-orders-setup';
import { navigateSection, noOverflow } from './support/browser-helpers';

test('comenzi active: cititorul deschide Operator fără catalog, creatorul nu citește istoricul și acțiunile rămân accesibile', async ({
  browser,
}, info) => {
  const f = await activeOrdersFixture(browser);
  try {
    const order = await f.create();
    const reader = await f.login('reader');
    const reads: string[] = [];
    reader.on('request', (request) => reads.push(new URL(request.url()).pathname));
    await navigateSection(reader, 'Operator');
    const panel = reader.getByRole('region', { name: 'Comenzi active', exact: true });
    const open = panel
      .getByTestId('active-order-card')
      .getByRole('button', { name: 'Deschide comanda', exact: true });
    await expect(open).toBeEnabled();
    await expect(reader.getByRole('region', { name: 'Comanda curentă', exact: true })).toHaveCount(
      0,
    );
    await open.focus();
    await reader.keyboard.press('Enter');
    await expect(
      reader.getByRole('dialog', { name: `Comanda #${order.number}`, exact: true }),
    ).toBeVisible();
    expect(
      reads.filter((path) => /\/catalog(?:\/|$)|\/orders\/(search|creators)$/.test(path)),
    ).toEqual([]);
    const creator = await f.login('creator');
    const creationReads: string[] = [];
    creator.on('request', (request) => creationReads.push(new URL(request.url()).pathname));
    await navigateSection(creator, 'Operator');
    await expect(
      creator
        .getByRole('region', { name: 'Catalog operator', exact: true })
        .getByRole('button', { name: /Produs activ/ }),
    ).toBeEnabled();
    await expect(creator.getByRole('region', { name: 'Comenzi active', exact: true })).toHaveCount(
      0,
    );
    expect(
      creationReads.filter((path) => /\/orders(?:$|\/(active|search|creators)$)/.test(path)),
    ).toEqual([]);
    await f.draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await f.operator
      .getByRole('region', { name: 'Catalog operator', exact: true })
      .getByRole('button', { name: /Produs activ/ })
      .click();
    const save = f.draft.getByRole('button', { name: 'Salvează ciorna', exact: true });
    await expect(save).toBeEnabled();
    const box = await save.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    await noOverflow(f.operator);
    await f.operator.screenshot({
      path: info.outputPath('active-orders-1440.png'),
      fullPage: true,
    });
    await f.operator.setViewportSize({ width: 360, height: 800 });
    await f.operator.getByRole('link', { name: 'Mergi la comenzile active', exact: true }).click();
    await expect(f.panel).toBeVisible();
    await noOverflow(f.operator);
    await f.operator.screenshot({ path: info.outputPath('active-orders-360.png'), fullPage: true });
    await f.operator
      .getByRole('link', { name: 'Înapoi la editorul comenzii', exact: true })
      .click();
    await f.operator.getByRole('button', { name: /^Comanda curentă \(/ }).click();
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeVisible();
    await expect(f.draft.getByLabel('Cantitate', { exact: true })).toHaveValue('1');
  } finally {
    await f.dispose();
  }
});
