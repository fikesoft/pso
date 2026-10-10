import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { OperationsFixture } from './operations.types';

export async function verifyDraftSnapshots(f: OperationsFixture) {
  const request = f.draft({ items: [{ productId: f.product.id, quantity: '1' }] });
  const concurrent = await Promise.all([
    f.worker.expect('/orders', 'POST', request),
    f.worker.expect('/orders', 'POST', request),
  ]);
  const order = concurrent[0].order;
  expect(concurrent[1].order.id).toBe(order.id);
  expect(order).toMatchObject({
    total: '10.01',
    version: 1,
    status: 'DRAFT',
    kitchenStatus: 'NOT_SENT',
  });
  expect(order.items[0]).toMatchObject({
    unitPrice: '10.0050',
    quantity: '1.000',
    lineTotal: '10.01',
  });
  expect((await f.worker.call('/orders', 'POST', { ...request, tableLabel: '8' })).status).toBe(
    409,
  );
  await f.a.primary.expect(
    `/catalog/products/${f.product.id}/locations/${f.a.location.id}`,
    'PUT',
    {
      version: 1,
      price: '20.0000',
      enabled: true,
    },
  );
  await f.a.primary.expect(`/catalog/products/${f.product.id}`, 'PATCH', {
    version: 1,
    name: 'Cafea redenumită',
  });
  const edit = {
    version: 1,
    serviceType: 'DINE_IN',
    tableLabel: '7',
    items: [
      { id: order.items[0].id, productId: f.product.id, quantity: '2' },
      { productId: f.product.id, quantity: '1' },
    ],
  };
  const races = await Promise.all([
    f.worker.call(`/orders/${order.id}`, 'PATCH', edit),
    f.worker.call(`/orders/${order.id}`, 'PATCH', edit),
  ]);
  expect(races.map((r) => r.status).sort()).toEqual([200, 409]);
  const updated = (await f.worker.expect(`/orders/${order.id}`)).order;
  expect(updated).toMatchObject({ total: '40.01', version: 2 });
  expect(updated.items[0]).toMatchObject({
    id: order.items[0].id,
    productName: 'Cafea inițială',
    unitPrice: '10.0050',
  });
  expect(updated.items[1]).toMatchObject({ productName: 'Cafea redenumită', unitPrice: '20.0000' });
  // Replay must still resolve the original creation, without using changed live prices.
  expect((await f.worker.expect('/orders', 'POST', request)).order.id).toBe(order.id);
  const foreignLine = (await f.worker.expect('/orders', 'POST', f.draft())).order.items[0];
  expect(
    (
      await f.worker.call(`/orders/${order.id}`, 'PATCH', {
        ...edit,
        version: 2,
        items: [{ id: foreignLine.id, productId: f.secondProduct.id, quantity: '1' }],
      })
    ).status,
  ).toBe(400);
  expect((await f.worker.call('/orders', 'POST', f.draft({ total: '0.01' }))).status).toBe(400);
  expect(
    (
      await f.worker.call(
        '/orders',
        'POST',
        f.draft({ items: [{ productId: f.secondProduct.id, quantity: '0' }] }),
      )
    ).status,
  ).toBe(400);
  expect((await f.worker.call('/orders', 'POST', f.draft({ tableLabel: '' }))).status).toBe(400);
}

export async function verifySendAndPreparation(f: OperationsFixture) {
  const order = (await f.worker.expect('/orders', 'POST', f.draft())).order;
  const body = { version: 1, requestKey: randomUUID() };
  const sends = await Promise.all([
    f.worker.expect(`/orders/${order.id}/send`, 'POST', body),
    f.worker.expect(`/orders/${order.id}/send`, 'POST', body),
  ]);
  expect(sends[0].ticket.id).toBe(sends[1].ticket.id);
  expect(sends[0].order).toMatchObject({
    status: 'CONFIRMED',
    kitchenStatus: 'QUEUED',
    version: 2,
  });
  const tickets = await f.cook.expect(`/kitchen/tickets?locationId=${f.a.location.id}`);
  const ticket = tickets.tickets.find((t: any) => t.orderId === order.id);
  expect(
    (
      await f.worker.call(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
        version: 1,
        status: 'PREPARING',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.b.primary.call(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
        version: 1,
        status: 'PREPARING',
      })
    ).status,
  ).toBe(404);
  expect((await f.cook.call('/orders', 'POST', f.draft())).status).toBe(403);
  expect(tickets.tickets.filter((t: any) => t.orderId === order.id)).toHaveLength(1);
  expect(ticket.items[0]).toMatchObject({
    productName: 'Ceai',
    quantity: '2.000',
    note: 'Fără zahăr',
  });
  expect(JSON.stringify(ticket)).not.toMatch(/total|price|unitPrice|MDL|Observație sintetică/);
  expect(
    (await f.worker.call(`/orders/${order.id}/send`, 'POST', { ...body, version: 2 })).status,
  ).toBe(409);
  expect(
    (
      await f.worker.call(`/orders/${order.id}`, 'PATCH', {
        version: 2,
        serviceType: 'TAKEAWAY',
        items: [{ productId: f.secondProduct.id, quantity: '1' }],
      })
    ).status,
  ).toBe(409);
  expect((await f.worker.call(`/orders/${order.id}/cancel`, 'POST', { version: 2 })).status).toBe(
    403,
  );
  expect(
    (await f.cook.call(`/kitchen/tickets/${ticket.id}`, 'PATCH', { version: 1, status: 'READY' }))
      .status,
  ).toBe(409);
  const transitions = await Promise.all([
    f.cook.call(`/kitchen/tickets/${ticket.id}`, 'PATCH', { version: 1, status: 'PREPARING' }),
    f.cook.call(`/kitchen/tickets/${ticket.id}`, 'PATCH', { version: 1, status: 'PREPARING' }),
  ]);
  expect(transitions.map((r) => r.status).sort()).toEqual([200, 409]);
  await f.cook.expect(`/kitchen/tickets/${ticket.id}`, 'PATCH', { version: 2, status: 'READY' });
  expect((await f.worker.expect(`/orders/${order.id}`)).order).toMatchObject({
    kitchenStatus: 'READY',
    version: 4,
    total: '10.50',
  });
  expect(
    (
      await f.cook.call(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
        version: 3,
        status: 'PREPARING',
      })
    ).status,
  ).toBe(409);
  expect((await f.worker.expect(`/orders/${order.id}/send`, 'POST', body)).ticket.id).toBe(
    ticket.id,
  );
}
