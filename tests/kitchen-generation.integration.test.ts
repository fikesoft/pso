import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
let f: Awaited<ReturnType<typeof prepareOperations>>;
beforeAll(async () => {
  f = await prepareOperations();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
it('generează un singur grup cu fiecare articol o dată; replay păstrează identitățile', async () => {
  const { order } = await f.a.primary.expect(
    '/orders',
    'POST',
    f.draft({
      items: [
        { productId: f.product.id, quantity: '1.5', note: 'Observație păstrată' },
        { productId: f.secondProduct.id, quantity: '2' },
      ],
    }),
  );
  const body = { version: order.version, requestKey: randomUUID() };
  const path = `/orders/${order.id}/send`;
  const results = await Promise.all([
    f.a.primary.call(path, 'POST', body),
    f.a.primary.call(path, 'POST', body),
  ]);
  expect(results.some((result) => result.status === 200)).toBe(true);
  for (const result of results) expect([200, 409]).toContain(result.status);
  const sent = await f.a.primary.expect(path, 'POST', body);
  expect(sent.ticket.batches).toEqual([
    {
      id: sent.ticket.id,
      status: 'QUEUED',
      version: 1,
      courseNumber: 0,
      firedAt: sent.ticket.createdAt,
      createdAt: sent.ticket.createdAt,
      updatedAt: sent.ticket.createdAt,
      station: null,
      ticketItemIds: sent.ticket.items.map((item: { id: string }) => item.id).sort(),
    },
  ]);
  expect(sent.ticket.items).toHaveLength(2);
  expect(sent.ticket.items[0]).toMatchObject({ quantity: '1.500', note: 'Observație păstrată' });
  expect(await f.a.primary.expect(path, 'POST', body)).toEqual(sent);
  const board = await f.cook.expect(`/kitchen/tickets?locationId=${f.a.location.id}&status=QUEUED`);
  expect(Date.parse(board.serverTime)).toBeGreaterThanOrEqual(Date.parse(sent.ticket.createdAt));
  expect(Math.abs(Date.now() - Date.parse(board.serverTime))).toBeLessThan(5000);
  expect(
    board.tickets.filter((ticket: { id: string }) => ticket.id === sent.ticket.id),
  ).toHaveLength(1);
  const preparing = await f.cook.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
    version: 1,
    status: 'PREPARING',
  });
  expect(preparing.ticket.batches).toEqual([
    { ...sent.ticket.batches[0], status: 'PREPARING', version: 2, updatedAt: expect.any(String) },
  ]);
  expect(Date.parse(preparing.ticket.batches[0].updatedAt)).toBeGreaterThanOrEqual(
    Date.parse(sent.ticket.batches[0].updatedAt),
  );
  expect((await f.a.primary.expect(path, 'POST', body)).ticket.batches).toEqual(
    preparing.ticket.batches,
  );
  expect((await f.a.primary.call(path, 'POST', { ...body, requestKey: randomUUID() })).status).toBe(
    409,
  );
  const foreign = await f.b.primary.expect(`/kitchen/tickets?locationId=${f.b.location.id}`);
  expect(foreign.tickets).toEqual([]);
});
