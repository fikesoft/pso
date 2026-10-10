import { afterAll, beforeAll, expect, it } from 'vitest';
import { attachTenantRealtime } from '../apps/api/src/features/realtime';
import { closeOperations, prepareOperations } from './api/operations-setup';
import { liveClient } from './api/support/realtime-client';
import { db, servers } from './api/support/harness';
import type { OperationsFixture } from './api/operations.types';

let fixture: OperationsFixture;
let gateway: ReturnType<typeof attachTenantRealtime>;
beforeAll(async () => {
  fixture = await prepareOperations();
  gateway = attachTenantRealtime(servers[0]!);
  await gateway.ready;
});
afterAll(async () => {
  await gateway?.close();
  if (fixture) await closeOperations(fixture.owner.id);
});

it('rejects unauthenticated and cross-origin upgrades', async () => {
  for (const client of [liveClient(), liveClient(fixture.worker, 'https://untrusted.example')]) {
    expect(await client.closed()).toBe(1006);
    expect(client.messages).toEqual([]);
  }
});

it('does not extend idle expiry through background reads or realtime handshakes', async () => {
  const { manager, a } = fixture;
  const state = await manager.expect('/auth/session');
  const context = { organizationId: a.company.organization.id, userId: state.user.id };
  const session = await db.withTenantTransaction(db.runtime, context, async (tx) => {
    const active = await tx.tenantSession.findFirstOrThrow({
      where: { userId: state.user.id, revokedAt: null },
    });
    return tx.tenantSession.update({
      where: { id: active.id },
      data: {
        idleExpiresAt: new Date(Date.now() + 120_000),
        lastSeenAt: new Date(Date.now() - 60_000),
      },
    });
  });
  expect(
    (await manager.call('/context', 'GET', undefined, { 'x-pos-background': 'true' })).status,
  ).toBe(200);
  const client = liveClient(manager);
  try {
    await client.next('ready');
    client.subscribe(a.location.id);
    await client.next('subscribed');
    const current = await db.withTenantTransaction(db.runtime, context, (tx) =>
      tx.tenantSession.findUniqueOrThrow({ where: { id: session.id } }),
    );
    expect(current.idleExpiresAt).toEqual(session.idleExpiresAt);
    expect(current.lastSeenAt).toEqual(session.lastSeenAt);
  } finally {
    client.socket.terminate();
  }
});

it('isolates organization/location subscriptions and publishes only committed changes', async () => {
  const { a, b, worker, manager, product, otherLocation } = fixture;
  const client = liveClient(worker);
  const foreign = liveClient(b.primary);
  const denied = liveClient(manager);
  try {
    await Promise.all([client.next('ready'), foreign.next('ready'), denied.next('ready')]);
    client.subscribe(a.location.id);
    foreign.subscribe(b.location.id);
    denied.subscribe(otherLocation.id);
    await Promise.all([client.next('subscribed'), foreign.next('subscribed')]);
    expect(await denied.closed()).toBe(1008);
    await a.primary.expect(`/catalog/products/${product.id}/locations/${a.location.id}`, 'PUT', {
      version: product.locationVersion,
      price: product.price,
      enabled: false,
    });
    expect(await client.next('changed')).toEqual({
      type: 'changed',
      topic: 'catalog',
      locationId: a.location.id,
    });
    await expect(
      db.withTenantTransaction(
        db.runtime,
        {
          organizationId: a.company.organization.id,
          userId: a.company.organization.primaryAdminUserId,
        },
        async (tx) => {
          await tx.product.update({
            where: { id: product.id },
            data: { name: 'Rollback realtime', version: { increment: 1 } },
          });
          throw new Error('Synthetic rollback');
        },
      ),
    ).rejects.toThrow('Synthetic rollback');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(client.messages).toEqual([]);
    expect(foreign.messages).toEqual([]);
    expect(
      (await a.primary.expect(`/catalog/products/${product.id}?locationId=${a.location.id}`))
        .product.name,
    ).toBe(product.name);
  } finally {
    client.socket.terminate();
    foreign.socket.terminate();
    denied.socket.terminate();
  }
});

it('rejects invalid protocols, binary frames, excessive payloads and users without catalog access', async () => {
  for (const [payload, expectedCode] of [
    ['invalid-json', 1008],
    [
      JSON.stringify({ type: 'subscribe', topic: 'orders', locationId: fixture.a.location.id }),
      1008,
    ],
    [Buffer.from('binary'), 1008],
    ['x'.repeat(1025), 1009],
  ] as const) {
    const client = liveClient(fixture.manager);
    try {
      await client.next('ready');
      client.socket.send(payload);
      expect(await client.closed()).toBe(expectedCode);
      expect(client.messages).toEqual([]);
    } finally {
      client.socket.terminate();
    }
  }
  const cook = liveClient(fixture.cook);
  try {
    await cook.next('ready');
    cook.subscribe(fixture.a.location.id);
    expect(await cook.closed()).toBe(1008);
  } finally {
    cook.socket.terminate();
  }
});

it('bounds concurrent connections per session and releases closed slots', async () => {
  const clients = Array.from({ length: 8 }, () => liveClient(fixture.manager));
  try {
    await Promise.all(clients.map((client) => client.next('ready')));
    const excess = liveClient(fixture.manager);
    expect(await excess.closed()).toBe(1006);
    expect(excess.messages).toEqual([]);
    clients[0]!.socket.close();
    await clients[0]!.closed();
    const replacement = liveClient(fixture.manager);
    clients.push(replacement);
    expect(await replacement.next('ready')).toEqual({ type: 'ready' });
  } finally {
    for (const client of clients) client.socket.terminate();
  }
});

it('expires idle sessions before delivering changes or accepting another handshake', async () => {
  const { b } = fixture;
  const client = liveClient(b.primary);
  try {
    await client.next('ready');
    client.subscribe(b.location.id);
    await client.next('subscribed');
    await db.withTenantTransaction(
      db.runtime,
      {
        organizationId: b.company.organization.id,
        userId: b.company.organization.primaryAdminUserId,
      },
      async (tx) => {
        await tx.tenantSession.updateMany({
          where: { userId: b.company.organization.primaryAdminUserId, revokedAt: null },
          data: { idleExpiresAt: new Date(Date.now() - 1000) },
        });
        await tx.$executeRaw`SELECT pg_notify('pos_catalog_changed', ${JSON.stringify({
          organizationId: b.company.organization.id,
          locationId: b.location.id,
        })})`;
      },
    );
    expect(await client.closed()).toBe(1008);
    expect(client.messages).toEqual([]);
    const reconnect = liveClient(b.primary);
    expect(await reconnect.closed()).toBe(1006);
  } finally {
    client.socket.terminate();
  }
});

it('closes a revoked session before it can receive another catalog update', async () => {
  const { a, worker, product } = fixture;
  const client = liveClient(worker);
  try {
    await client.next('ready');
    client.subscribe(a.location.id);
    await client.next('subscribed');
    await worker.expect('/auth/logout', 'POST');
    await a.primary.expect(`/catalog/products/${product.id}`, 'PATCH', {
      version: product.version,
      name: 'Produs după logout',
    });
    expect(await client.closed()).toBe(1008);
    expect(client.messages).toEqual([]);
  } finally {
    client.socket.terminate();
  }
});
