import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { completePacking } from './support/complete-packing';
import { api } from './support/browser-helpers';
export async function customerAnalyticsFixture(browser: Browser) {
  const f = await operationsFixture(browser);
  const page = f.admin;
  try {
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    const product = await createOperationalProduct(page);
    const request = async (
      path: string,
      body?: unknown,
      method: 'GET' | 'POST' | 'PATCH' = body ? 'POST' : 'GET',
    ) => {
      const response = await api(page, path, body, method);
      expect(response.status()).toBe(200);
      return response.json();
    };
    const { customer } = await request('/customers', {
      locationId: f.location.id,
      requestKey: randomUUID(),
      name: 'Client analiză',
      phone: '060133001',
    });
    const { order } = await request('/orders', {
      locationId: f.location.id,
      requestKey: randomUUID(),
      serviceType: 'PICKUP',
      customerRef: { id: customer.id, version: 1 },
      items: [{ productId: product.id, quantity: '1' }],
    });
    const { ticket } = await request(`/orders/${order.id}/send`, {
      version: order.version,
      requestKey: randomUUID(),
    });
    for (const [index, status] of ['PREPARING', 'READY'].entries())
      await request(`/kitchen/tickets/${ticket.id}`, { version: index + 1, status }, 'PATCH');
    const ready = await completePacking(page, order.id);
    const finished = await request(`/orders/${order.id}/complete`, {
      version: ready.version,
      requestKey: randomUUID(),
    });
    const cashShiftId = (await f.cashShift()).id;
    const paid = await request(`/orders/${order.id}/payments`, {
      version: finished.order.version,
      requestKey: randomUUID(),
      cashShiftId,
      confirmed: true,
      payments: [{ method: 'CASH', amount: '7.00', receivedAmount: '7.00' }],
    });
    const { payments } = await request(`/orders/${order.id}/payments`);
    await request(`/orders/${order.id}/refunds`, {
      version: paid.order.version,
      requestKey: randomUUID(),
      cashShiftId,
      confirmed: true,
      reason: 'Probă analitică',
      refunds: [{ paymentId: payments[0].id, amount: '2.00' }],
    });
    return { ...f, customer, product, order };
  } catch (error) {
    await f.dispose();
    throw error;
  }
}
