import { test, expect } from '@playwright/test';
import { createDeliverySandbox } from '../../scripts/delivery-sandbox/model/server';
import { close, listen } from '../support/storefront-fixture';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, localOnly, noOverflow } from './support/browser-helpers';
import { connectWebsite, openWebsiteOrder } from './support/website-flow';

test('website local păstrează două linii cu opțiuni diferite și arată alegerea operatorului', async ({
  browser,
}) => {
  const fixture = await operationsFixture(browser);
  const visitorContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await localOnly(visitorContext);
  let storefront: ReturnType<typeof createDeliverySandbox> | undefined;
  try {
    const { admin, location } = fixture;
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    const groupResponse = await api(admin, '/catalog/modifier-groups', {
      name: 'Mărime website',
      minSelections: 0,
      maxSelections: 1,
      sortOrder: 1,
    });
    expect(groupResponse.status()).toBe(200);
    const group = (await groupResponse.json()).modifierGroup;
    expect(
      (
        await api(admin, `/catalog/modifier-groups/${group.id}/options`, {
          name: 'Mare website',
          extraPrice: '2.1250',
          sortOrder: 1,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await api(admin, `/catalog/products/${product.id}/modifier-groups`, {
          modifierGroupId: group.id,
        })
      ).status(),
    ).toBe(200);
    async function setEnabled(enabled: boolean) {
      const current = (
        await (await api(admin, `/catalog/products/${product.id}?locationId=${location.id}`)).json()
      ).product;
      const response = await api(
        admin,
        `/catalog/products/${product.id}/locations/${location.id}`,
        { version: current.locationVersion, price: current.price, enabled },
        'PUT',
      );
      expect(response.status()).toBe(200);
    }
    await setEnabled(false);
    const issued = await connectWebsite(admin);
    storefront = createDeliverySandbox({
      apiKey: issued.apiKey,
      posOrigin: 'http://127.0.0.1:4000',
    });
    const origin = await listen(storefront);
    const visitor = await visitorContext.newPage();
    const leaked: string[] = [];
    visitor.on('request', (request) => {
      if (
        `${request.url()}${JSON.stringify(request.headers())}${request.postData()}`.includes(
          issued.apiKey,
        )
      )
        leaked.push('request');
    });
    await visitor.goto(origin);
    await expect(
      visitor.getByText('Nu există produse disponibile în locația conectată.', { exact: true }),
    ).toBeVisible();
    await setEnabled(true);
    await expect(visitor.getByText(/Mărime website — alege 0–1/)).toBeVisible();
    await visitor.getByRole('radio', { name: /Mare website/ }).check();
    await visitor.getByRole('button', { name: 'Adaugă Cafea sintetică în coș' }).click();
    await visitor.getByRole('radio', { name: 'Fără opțiune' }).check();
    await visitor.getByRole('button', { name: 'Adaugă Cafea sintetică în coș' }).click();
    await expect(visitor.locator('#cart li')).toHaveCount(2);
    await expect(visitor.locator('#cart-total')).toHaveText('Total: 22.14 MDL');
    const menuWindow = {
      name: 'Program website sintetic',
      eventName: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startMinute: 0,
      endMinute: 1440,
      startsOn: '1970-01-01',
      endsOn: '1970-01-01',
      productIds: [product.id],
    };
    const menu = (
      await (
        await api(admin, '/catalog/menu-schedules', {
          ...menuWindow,
          locationId: location.id,
          requestKey: crypto.randomUUID(),
        })
      ).json()
    ).schedule;
    await expect(
      visitor.getByRole('button', { name: 'Cumpără Cafea sintetică', exact: true }),
    ).toBeDisabled();
    await expect(visitor.getByRole('radio', { name: 'Fără opțiune' })).toBeChecked();
    await expect(visitor.locator('#cart li')).toHaveCount(2);
    expect(
      (
        await api(
          admin,
          `/catalog/menu-schedules/${menu.id}`,
          {
            ...menuWindow,
            version: menu.version,
            status: 'ARCHIVED',
          },
          'PATCH',
        )
      ).status(),
    ).toBe(200);
    await expect(
      visitor.getByRole('button', { name: 'Cumpără Cafea sintetică', exact: true }),
    ).toBeEnabled();
    await expect(visitor.locator('#cart li')).toHaveCount(2);
    await setEnabled(false);
    await expect(
      visitor.getByRole('button', { name: 'Cumpără Cafea sintetică', exact: true }),
    ).toBeDisabled();
    await expect(visitor.locator('#cart li')).toHaveCount(2);
    await expect(visitor.getByRole('radio', { name: 'Fără opțiune' })).toBeChecked();
    await setEnabled(true);
    await expect(
      visitor.getByRole('button', { name: 'Cumpără Cafea sintetică', exact: true }),
    ).toBeEnabled();
    await expect(visitor.locator('#cart li')).toHaveCount(2);
    await noOverflow(visitor);
    const sent = visitor.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/api/buy'),
    );
    await visitor.getByRole('button', { name: 'Trimite coșul' }).click();
    const result = await sent;
    expect(result.status()).toBe(200);
    const receipt = (await result.json()).receipt;
    expect(receipt.total).toBe('22.14');
    const details = await openWebsiteOrder(admin, receipt.externalOrderId);
    await expect(details.getByText('Mărime website: Mare website')).toBeVisible();
    await expect(details.getByText('Cafea sintetică')).toHaveCount(2);
    expect(leaked).toEqual([]);
  } finally {
    await visitorContext.close();
    if (storefront) await close(storefront);
    await fixture.dispose();
  }
});
