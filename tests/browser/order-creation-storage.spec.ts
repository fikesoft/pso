import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, submit } from './support/browser-helpers';

test('creare: stocarea indisponibilă blochează POST și editarea până la retry sigur', async ({
  browser,
}) => {
  const f = await operationsFixture(browser);
  const { admin, location } = f;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await createOperationalProduct(admin);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = admin.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('PICKUP');
    await draft
      .getByLabel('Observații comandă', { exact: true })
      .fill('Ciornă păstrată în memorie');
    await draft.getByRole('button', { name: /Cafea sintetică/ }).click();
    let posts = 0;
    admin.on('request', (request) => {
      if (request.url().endsWith('/api/tenant/orders') && request.method() === 'POST') posts++;
    });
    await admin.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('pos.order-creation:'))
          throw new DOMException('Storage unavailable', 'QuotaExceededError');
        original.call(this, key, value);
      };
      Object.defineProperty(window, 'restoreCreationStorage', {
        configurable: true,
        value: () => {
          Storage.prototype.setItem = original;
        },
      });
    });
    await draft.getByRole('button', { name: 'Salvează ciorna', exact: true }).click();
    await expect(
      draft
        .getByText(
          'Nu putem păstra cheia cererii în această filă. Crearea este blocată pentru a evita duplicatele.',
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    expect(posts).toBe(0);
    await expect(draft.getByLabel('Observații comandă', { exact: true })).toBeDisabled();
    await expect(draft.getByLabel('Cantitate', { exact: true })).toBeDisabled();
    await admin.keyboard.press('Escape');
    await expect(draft).toBeVisible();
    await admin.evaluate(() => {
      Object.getOwnPropertyDescriptor(window, 'restoreCreationStorage')!.value();
      Reflect.deleteProperty(window, 'restoreCreationStorage');
    });
    const retry = admin.waitForRequest(
      (r) => r.url().endsWith('/api/tenant/orders') && r.method() === 'POST',
    );
    const created = await submit(
      admin,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Reîncearcă cererea', exact: true }),
    );
    const body = JSON.parse((await retry).postData()!);
    expect(body).toMatchObject({
      notes: 'Ciornă păstrată în memorie',
      serviceType: 'PICKUP',
      items: [{ quantity: '1' }],
    });
    expect(created.order.notes).toBe('Ciornă păstrată în memorie');
    expect(posts).toBe(1);
    expect(
      (await (await api(admin, `/orders?locationId=${location.id}`)).json()).orders,
    ).toHaveLength(1);
    expect(
      await admin.evaluate(() =>
        Object.keys(sessionStorage).filter((key) => key.startsWith('pos.order-creation:')),
      ),
    ).toHaveLength(0);
  } finally {
    await f.dispose();
  }
});
