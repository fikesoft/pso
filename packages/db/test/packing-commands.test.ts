import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient, withTenantTransaction } from '../src';
import { createPackingSessionFixture } from './fixtures/packing-session.fixture';
import { advanceKitchenBatch } from './fixtures/kitchen-batches.fixture';

test('PostgreSQL: comenzile ambalării cer bucătărie gata, checklist complet și proveniență atomică', async () => {
  const f = await createPackingSessionFixture();
  try {
    const base = {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      sessionId: f.session.id,
      actorUserId: f.a.user.id,
      status: 'SUCCEEDED',
      requestHash: 'a'.repeat(64),
    };
    const start = { ...base, action: 'START', expectedVersion: 1, requestKey: randomUUID() };
    await assert.rejects(
      f.txA((tx) => tx.packingCommand.create({ data: { ...start, actorUserId: f.b.user.id } })),
      /active scoped actor/,
    );
    await assert.rejects(
      f.txA((tx) => tx.packingCommand.create({ data: { ...start, locationId: f.locationA2.id } })),
      /scoped session/,
    );
    await assert.rejects(
      f.txA((tx) => tx.packingCommand.create({ data: start })),
      /kitchen ready/,
    );
    for (const status of ['PREPARING', 'READY'])
      await f.txA((tx) => advanceKitchenBatch(tx, f.ticket.id, f.a.user.id, status));
    const order = await f.txA((tx) =>
      tx.order.findUniqueOrThrow({ where: { id: f.ticket.orderId } }),
    );
    await assert.rejects(
      f.txA(async (tx) => {
        await tx.packingCommand.create({ data: start });
        assert.equal((await tx.packingSession.findFirstOrThrow()).status, 'PACKING');
        throw new Error('rollback pornire');
      }),
      /rollback pornire/,
    );
    assert.equal((await f.txA((tx) => tx.packingSession.findFirstOrThrow())).status, 'WAITING');
    assert.equal(await f.txA((tx) => tx.packingCommand.count()), 0);
    const started = await f.txA((tx) =>
      tx.packingCommand.create({
        data: { ...start, resultVersion: 99, resultStatus: 'READY', createdAt: new Date(0) },
      }),
    );
    assert.equal(started.resultVersion, 2);
    assert.equal(started.resultStatus, 'PACKING');
    assert.ok(started.createdAt > f.session.createdAt);
    const active = await f.txA((tx) => tx.packingSession.findFirstOrThrow());
    assert.equal(active.startedAt!.toISOString(), started.createdAt.toISOString());
    assert.equal(active.startedByUserId, f.a.user.id);
    assert.equal(active.lastCommandId, started.id);
    const complete = { ...base, action: 'COMPLETE', expectedVersion: 2, requestKey: randomUUID() };
    await assert.rejects(
      f.txA((tx) => tx.packingCommand.create({ data: complete })),
      /every item checked/,
    );
    const check = {
      ...base,
      action: 'CHECK_ITEM',
      itemId: f.items[0]!.id,
      checked: true,
      expectedVersion: 2,
      requestKey: randomUUID(),
    };
    await assert.rejects(
      f.txA((tx) => tx.packingCommand.create({ data: { ...check, itemId: randomUUID() } })),
      /changed scoped item/,
    );
    const checked = await f.txA((tx) => tx.packingCommand.create({ data: check }));
    assert.equal(checked.resultVersion, 3);
    const item = await f.txA((tx) => tx.packingItem.findFirstOrThrow());
    assert.equal(item.checked, true);
    assert.equal(item.checkedAt!.toISOString(), checked.createdAt.toISOString());
    assert.equal(item.lastCommandId, checked.id);
    await assert.rejects(
      f.txA((tx) => tx.packingItem.update({ where: { id: item.id }, data: { checked: false } })),
      /atomic immutable command/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.packingSession.update({
          where: { id: f.session.id },
          data: { version: 4, lastCommandId: checked.id },
        }),
      ),
      /atomic operation/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.packingCommand.create({
          data: { ...check, expectedVersion: 3, requestKey: randomUUID() },
        }),
      ),
      /changed scoped item/,
    );
    await f.txA((tx) =>
      tx.packingCommand.create({
        data: { ...check, checked: false, expectedVersion: 3, requestKey: randomUUID() },
      }),
    );
    await assert.rejects(
      f.txA((tx) => tx.packingCommand.create({ data: { ...complete, expectedVersion: 4 } })),
      /every item checked/,
    );
    await f.txA((tx) =>
      tx.packingCommand.create({
        data: { ...check, expectedVersion: 4, requestKey: randomUUID() },
      }),
    );
    const done = await f.txA((tx) =>
      tx.packingCommand.create({ data: { ...complete, expectedVersion: 5 } }),
    );
    const session = await f.txA((tx) => tx.packingSession.findFirstOrThrow());
    assert.equal(session.status, 'READY');
    assert.equal(session.version, 6);
    assert.equal(session.completedAt!.toISOString(), done.createdAt.toISOString());
    assert.equal(session.startedAt!.toISOString(), started.createdAt.toISOString());
    await assert.rejects(
      f.txA((tx) =>
        tx.packingCommand.create({
          data: { ...check, checked: false, expectedVersion: 6, requestKey: randomUUID() },
        }),
      ),
      /changed scoped item/,
    );
    assert.deepEqual(
      await f.txA((tx) => tx.packingCommand.findUniqueOrThrow({ where: { id: started.id } })),
      started,
    );
    assert.equal(await f.runtime.packingCommand.count(), 0);
    assert.equal(await f.txB((tx) => tx.packingCommand.count()), 0);
    await assert.rejects(f.platform.packingCommand.count(), /permission denied/);
    await assert.rejects(f.auth.packingCommand.count(), /permission denied/);
    await assert.rejects(
      f.txA((tx) => tx.packingCommand.delete({ where: { id: started.id } })),
      /permission denied/,
    );
    assert.equal(await f.txA((tx) => tx.inventoryReservation.count()), 1);
    assert.equal(
      (await f.txA((tx) => tx.inventoryReservation.findFirstOrThrow())).status,
      'PENDING',
    );
    assert.equal(
      (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }))).version,
      order.version + 1,
    );
    await f.txA(async (tx) => {
      await tx.kitchenTicket.update({
        where: { id: f.ticket.id },
        data: { status: 'CANCELLED', version: 4, updatedByUserId: f.a.user.id },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED', version: order.version + 2 },
      });
      const reservation = await tx.inventoryReservation.findFirstOrThrow();
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED', resolvedAt: new Date() },
      });
      await tx.orderStatusEvent.create({
        data: {
          organizationId: f.a.organization.id,
          locationId: f.locationA.id,
          orderId: order.id,
          kind: 'ORDER',
          fromStatus: 'READY',
          toStatus: 'CANCELLED',
          actorUserId: f.a.user.id,
          reason: 'Anulare după verificare',
        },
      });
    });
    const cancelled = await f.txA((tx) => tx.packingSession.findFirstOrThrow());
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(cancelled.version, 7);
    assert.equal(cancelled.completedAt!.toISOString(), session.completedAt!.toISOString());
    assert.equal(cancelled.lastCommandId, done.id);
    assert.equal((await f.txA((tx) => tx.packingItem.findFirstOrThrow())).checked, true);
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});

test('PostgreSQL: concurența pe două conexiuni și retragerea tentativei previn dublarea', async () => {
  const f = await createPackingSessionFixture('PICKUP');
  const concurrent = createDatabaseClient(process.env.TEST_DATABASE_URL!, 2);
  try {
    for (const status of ['PREPARING', 'READY'])
      await f.txA((tx) => advanceKitchenBatch(tx, f.ticket.id, f.a.user.id, status));
    const base = {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      sessionId: f.session.id,
      actorUserId: f.a.user.id,
    };
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        withTenantTransaction(
          concurrent,
          { organizationId: f.a.organization.id, userId: f.a.user.id },
          (tx) =>
            tx.packingCommand.create({
              data: {
                ...base,
                action: 'START',
                status: 'SUCCEEDED',
                expectedVersion: 1,
                requestHash: 'b'.repeat(64),
                requestKey: randomUUID(),
              },
            }),
        ),
      ),
    );
    assert.equal(results.filter((entry) => entry.status === 'fulfilled').length, 1);
    assert.equal(results.filter((entry) => entry.status === 'rejected').length, 1);
    const key = randomUUID();
    await f.txA((tx) =>
      tx.packingCommand.create({
        data: { ...base, requestKey: key, action: 'CHECK_ITEM', status: 'RETIRED' },
      }),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.packingCommand.create({
          data: {
            ...base,
            requestKey: key,
            action: 'CHECK_ITEM',
            status: 'SUCCEEDED',
            expectedVersion: 2,
            requestHash: 'c'.repeat(64),
            itemId: f.items[0]!.id,
            checked: true,
          },
        }),
      ),
      /Unique constraint/,
    );
    assert.equal((await f.txA((tx) => tx.packingSession.findFirstOrThrow())).version, 2);
    assert.equal((await f.txA((tx) => tx.packingItem.findFirstOrThrow())).checked, false);
    assert.equal(await f.txA((tx) => tx.packingCommand.count()), 2);
  } finally {
    await Promise.all([
      concurrent.$disconnect(),
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
    ]);
  }
});
