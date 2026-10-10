import { completePacking } from './support/complete-packing';
import { expect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { customerAddressFixture } from './customer-address-setup';
import { api, navigateSection } from './support/browser-helpers';

export async function orderRepeatFixture(browser: Browser) {
  const f = await customerAddressFixture(browser);
  try {
    const request = async (
      path: string,
      body: unknown,
      method: 'POST' | 'PATCH' | 'PUT' = 'POST',
    ) => {
      const result = await api(f.admin, path, body, method);
      expect(result.status(), `${method} ${path}`).toBe(200);
      return result.json();
    };
    const stopped = (
      await f.post('/catalog/products', {
        locationId: f.location.id,
        name: 'Produs istoric oprit',
        sku: 'REPEAT-STOP',
        price: '4',
      })
    ).product;
    const group = (
      await f.post('/catalog/modifier-groups', {
        name: 'Adaos istoric',
        minSelections: 1,
        maxSelections: 1,
      })
    ).modifierGroup;
    const option = (
      await f.post(`/catalog/modifier-groups/${group.id}/options`, {
        name: 'Opțiune păstrată',
        extraPrice: '1',
      })
    ).modifierOption;
    await f.post(`/catalog/products/${f.product.id}/modifier-groups`, {
      modifierGroupId: group.id,
    });
    await f.post(`/inventory/modifier-recipes/${f.product.id}/${option.id}`, {
      expectedVersion: 0,
      requestKey: crypto.randomUUID(),
      reason: 'Adaos fără efect de stoc',
      components: [],
    });
    const catalog = (
      await (
        await api(f.admin, `/catalog/products/${f.product.id}?locationId=${f.location.id}`)
      ).json()
    ).product;
    const binding = catalog.modifierGroups[0];
    const source = (
      await f.post('/orders', {
        locationId: f.location.id,
        requestKey: crypto.randomUUID(),
        source: 'PHONE',
        serviceType: 'DELIVERY',
        customerRef: { id: f.customer.id, version: 1 },
        deliveryAddress: { address: 'Adresă istorică de exclus' },
        notes: 'Notă istorică generală de exclus',
        items: [
          {
            productId: f.product.id,
            quantity: '2',
            note: 'Notă istorică pe linie',
            modifiers: [
              {
                bindingId: binding.id,
                bindingVersion: binding.version,
                groupVersion: binding.group.version,
                optionIds: [option.id],
              },
            ],
          },
          { productId: stopped.id, quantity: '1' },
        ],
      })
    ).order;
    const sent = await f.post(`/orders/${source.id}/send`, {
      version: source.version,
      requestKey: crypto.randomUUID(),
    });
    await request(
      `/kitchen/tickets/${sent.ticket.id}`,
      { version: 1, status: 'PREPARING' },
      'PATCH',
    );
    await request(`/kitchen/tickets/${sent.ticket.id}`, { version: 2, status: 'READY' }, 'PATCH');
    const ready = await completePacking(f.admin, source.id);
    await f.post(`/orders/${source.id}/complete`, {
      version: ready.version,
      requestKey: crypto.randomUUID(),
    });
    const historical = (await (await api(f.admin, `/orders/${source.id}`)).json()).order;
    const changeCatalog = async () => {
      await request(
        `/catalog/products/${stopped.id}/locations/${f.location.id}`,
        { version: stopped.locationVersion, price: '4', enabled: false },
        'PUT',
      );
      await request(
        `/catalog/products/${f.product.id}/locations/${f.location.id}`,
        { version: f.product.locationVersion, price: '15', enabled: true },
        'PUT',
      );
      const required = (
        await f.post('/catalog/modifier-groups', {
          name: 'Alegere nouă',
          minSelections: 1,
          maxSelections: 1,
        })
      ).modifierGroup;
      const requiredOption = (
        await f.post(`/catalog/modifier-groups/${required.id}/options`, {
          name: 'Opțiune obligatorie nouă',
          extraPrice: '2',
        })
      ).modifierOption;
      await f.post(`/catalog/products/${f.product.id}/modifier-groups`, {
        modifierGroupId: required.id,
      });
      return requiredOption;
    };
    return { ...f, stopped, group, option, source: historical, request, changeCatalog };
  } catch (error) {
    await f.dispose();
    throw error;
  }
}

export async function openRepeatDetails(f: Awaited<ReturnType<typeof orderRepeatFixture>>) {
  await navigateSection(f.operator, 'Comenzi');
  await f.operator
    .getByRole('article')
    .filter({
      has: f.operator.getByRole('heading', { name: `Comanda #${f.source.number}`, exact: true }),
    })
    .getByRole('button', { name: 'Deschide comanda', exact: true })
    .click();
  return f.operator.getByRole('dialog', { name: `Comanda #${f.source.number}`, exact: true });
}
