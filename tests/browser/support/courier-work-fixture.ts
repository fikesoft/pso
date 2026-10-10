import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { operationsFixture } from './operations-fixture';
import { api, session } from './browser-helpers';
import { createOperationalProduct } from './operations-catalog';
export async function courierWorkFixture(browser: Browser, historyCount = 1, activeCount = 1) {
  const f = await operationsFixture(browser),
    page = f.admin;
  try {
    const identity = await session(page),
      profileId = randomUUID();
    expect(
      (
        await api(page, `/couriers/${profileId}/commands`, {
          action: 'CREATE',
          locationId: f.location.id,
          userId: identity.user.id,
          requestKey: randomUUID(),
          profile: { vehicle: 'BICYCLE', capacity: 20 },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await api(page, `/couriers/${profileId}/commands`, {
          action: 'SET_AVAILABILITY',
          locationId: f.location.id,
          version: 1,
          requestKey: randomUUID(),
          availability: 'AVAILABLE',
        })
      ).status(),
    ).toBe(200);
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    const product = await createOperationalProduct(page);
    const numbers: number[] = [];
    const orderIds: string[] = [];
    for (let index = 0; index < historyCount + activeCount; index++) {
      let response = await api(page, '/orders', {
        locationId: f.location.id,
        serviceType: 'DELIVERY',
        requestKey: randomUUID(),
        customer: { name: 'Client livrare sintetic', phone: '+37360000000' },
        deliveryAddress: {
          address: 'Adresă sintetică pentru curier',
          instructions: 'Intrarea laterală',
        },
        items: [{ productId: product.id, quantity: '1' }],
      });
      expect(response.status()).toBe(200);
      let { order } = await response.json();
      response = await api(page, `/orders/${order.id}/confirm`, {
        version: order.version,
        requestKey: randomUUID(),
      });
      expect(response.status()).toBe(200);
      order = (await response.json()).order;
      response = await api(page, `/orders/${order.id}/delivery`, {
        version: order.version,
        requestKey: randomUUID(),
        status: 'ASSIGNED',
        courierUserId: identity.user.id,
      });
      expect(response.status()).toBe(200);
      order = (await response.json()).order;
      numbers.push(order.number);
      orderIds.push(order.id);
      if (index < historyCount)
        expect(
          (
            await api(page, `/orders/${order.id}/delivery`, {
              version: order.version,
              requestKey: randomUUID(),
              status: 'FAILED',
              reason: 'Destinație indisponibilă',
            })
          ).status(),
        ).toBe(200);
    }
    return { ...f, numbers, orderIds };
  } catch (error) {
    await f.dispose();
    throw error;
  }
}
