import { completePacking } from './api/complete-packing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { attachTenantRealtime } from '../apps/api/src/features/realtime';
import { prepareOperations, closeOperations } from './api/operations-setup';
import { liveClient } from './api/support/realtime-client';
import { db, servers } from './api/support/harness';
import type { BrowserSession } from './api/support/harness';
import type { KitchenTicket } from '../packages/contracts/src';
let f: Awaited<ReturnType<typeof prepareOperations>>;
let gateway: ReturnType<typeof attachTenantRealtime>;
beforeAll(async () => {
  f = await prepareOperations();
  gateway = attachTenantRealtime(servers[0]!);
  await gateway.ready;
}, 60_000);
afterAll(async () => {
  await gateway?.close();
  if (f) await closeOperations(f.owner.id);
});
async function kitchenLive(session: BrowserSession, locationId: string) {
  const client = liveClient(session);
  await client.next('ready');
  client.subscribe(locationId, 'kitchen');
  await client.next('subscribed');
  expect(await client.next('resync')).toEqual({ type: 'resync', topic: 'kitchen', locationId });
  return client;
}
it('bucătarul primește schimbări numai după commit, fără ID-uri de comenzi sau date financiare', async () => {
  const locationId = f.a.location.id;
  const client = await kitchenLive(f.cook, locationId);
  const foreign = await kitchenLive(f.b.primary, f.b.location.id);
  const otherLocation = await kitchenLive(f.a.primary, f.otherLocation.id);
  try {
    const { order } = await f.a.primary.expect('/orders', 'POST', f.draft());
    const { ticket } = await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
    });
    expect(await client.next('changed')).toEqual({ type: 'changed', topic: 'kitchen', locationId });
    await expect(
      db.withTenantTransaction(
        db.runtime,
        {
          organizationId: f.a.company.organization.id,
          userId: f.a.company.organization.primaryAdminUserId,
        },
        async (tx) => {
          await tx.kitchenTicket.update({
            where: { id: ticket.id },
            data: {
              status: 'PREPARING',
              version: 2,
              updatedByUserId: f.a.company.organization.primaryAdminUserId,
            },
          });
          throw new Error('Synthetic kitchen rollback');
        },
      ),
    ).rejects.toThrow('Synthetic kitchen rollback');
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(client.messages).toEqual([]);
    expect(foreign.messages).toEqual([]);
    expect(otherLocation.messages).toEqual([]);
    await f.cook.expect(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
      version: 1,
      status: 'PREPARING',
    });
    expect(await client.next('changed')).toEqual({ type: 'changed', topic: 'kitchen', locationId });
    await f.cook.expect(`/kitchen/tickets/${ticket.id}`, 'PATCH', { version: 2, status: 'READY' });
    await client.next('changed');
    const current = await completePacking(f.a.primary, order.id);
    await f.a.primary.expect(`/orders/${order.id}/complete`, 'POST', {
      version: current.version,
      requestKey: randomUUID(),
    });
    await client.next('changed');
    expect((await f.cook.expect(`/kitchen/tickets?locationId=${locationId}`)).tickets).toEqual([]);
  } finally {
    client.socket.terminate();
    foreign.socket.terminate();
    otherLocation.socket.terminate();
  }
});
it('notifică progresul unui grup chiar dacă starea agregată rămâne aceeași', async () => {
  const locationId = f.a.location.id;
  const { station } = await f.a.primary.expect('/kitchen-stations', 'POST', {
    locationId,
    requestKey: randomUUID(),
    code: 'BAR',
    name: 'Bar live',
    sortOrder: 0,
  });
  await f.a.primary.expect('/kitchen-routing', 'PUT', {
    locationId,
    productId: f.product.id,
    version: 0,
    stationId: station.id,
    requestKey: randomUUID(),
  });
  const { order } = await f.a.primary.expect(
    '/orders',
    'POST',
    f.draft({
      items: [
        { productId: f.product.id, quantity: '1' },
        { productId: f.secondProduct.id, quantity: '1' },
      ],
    }),
  );
  const ticket: KitchenTicket = (
    await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
    })
  ).ticket;
  const client = await kitchenLive(f.cook, locationId);
  try {
    for (const batch of ticket.batches) {
      const response = await f.cook.expect(
        `/kitchen/tickets/${ticket.id}/batches/${batch.id}`,
        'PATCH',
        { version: 1, status: 'PREPARING' },
      );
      expect(response.ticket.status).toBe('PREPARING');
      expect(await client.next('changed')).toEqual({
        type: 'changed',
        topic: 'kitchen',
        locationId,
      });
    }
    const current = (await f.a.primary.expect(`/orders/${order.id}`)).order;
    await f.a.primary.expect(`/orders/${order.id}/cancel`, 'POST', {
      version: current.version,
      requestKey: randomUUID(),
      reason: 'Anulare realtime sintetică',
    });
    await client.next('changed');
    expect((await f.cook.expect(`/kitchen/tickets?locationId=${locationId}`)).tickets).toEqual([]);
  } finally {
    client.socket.terminate();
  }
});
it('refuză lipsa kitchen.read, altă locație și alt tenant', async () => {
  for (const [session, locationId] of [
    [f.manager, f.a.location.id],
    [f.cook, f.otherLocation.id],
    [f.b.primary, f.a.location.id],
  ] as const) {
    const client = liveClient(session);
    try {
      await client.next('ready');
      client.subscribe(locationId, 'kitchen');
      expect(await client.closed()).toBe(1008);
      expect(client.messages).toEqual([]);
    } finally {
      client.socket.terminate();
    }
  }
});
it('revocarea sesiunii este verificată înainte de livrarea unei invalidări KDS', async () => {
  const state = await f.cook.expect('/auth/session');
  const client = await kitchenLive(f.cook, f.a.location.id);
  try {
    await db.withTenantTransaction(
      db.runtime,
      {
        organizationId: f.a.company.organization.id,
        userId: f.a.company.organization.primaryAdminUserId,
      },
      async (tx) => {
        await tx.tenantSession.updateMany({
          where: { userId: state.user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.$executeRaw`SELECT pg_notify('pos_kitchen_changed',${JSON.stringify({ organizationId: f.a.company.organization.id, locationId: f.a.location.id })})`;
      },
    );
    expect(await client.closed()).toBe(1008);
    expect(client.messages).toEqual([]);
  } finally {
    client.socket.terminate();
  }
});
