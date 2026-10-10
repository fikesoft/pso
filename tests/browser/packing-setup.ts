import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { api } from './support/browser-helpers';

export async function packingBrowserFixture(browser: Browser) {
  const f = await operationsFixture(browser);
  try {
    const productResponse = await api(f.admin, '/catalog/products', {
      locationId: f.location.id,
      name: 'Produs verificare ambalare',
      sku: 'PACK-CHECK',
      price: '10',
    });
    expect(productResponse.status()).toBe(200);
    const { product } = await productResponse.json();
    const created = await api(f.admin, '/orders', {
      locationId: f.location.id,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: '1' }],
    });
    expect(created.status()).toBe(200);
    const { order } = await created.json();
    const sent = await api(f.admin, `/orders/${order.id}/send`, {
      version: order.version,
      requestKey: randomUUID(),
    });
    expect(sent.status()).toBe(200);
    const { ticket } = await sent.json();
    for (const [index, status] of ['PREPARING', 'READY'].entries())
      expect(
        (
          await api(
            f.admin,
            `/kitchen/tickets/${ticket.id}`,
            { version: index + 1, status },
            'PATCH',
          )
        ).status(),
      ).toBe(200);
    const sessions = await (
      await api(f.admin, `/packing/sessions?locationId=${f.location.id}`)
    ).json();
    const session = sessions.sessions.find((row: { orderId: string }) => row.orderId === order.id);
    expect(session).toBeDefined();
    return { ...f, session, order, path: `/api/tenant/packing/sessions/${session.id}/commands` };
  } catch (error) {
    await f.dispose();
    throw error;
  }
}
