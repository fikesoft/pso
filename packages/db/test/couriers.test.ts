import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createCourierFixture } from './fixtures/courier.fixture';
import { writeDelivery } from './fixtures/delivery.fixture';
test('PostgreSQL: profilul curierului are creare atomică, versiuni și istoric imuabil', async () => {
  const f = await createCourierFixture();
  try {
    const data = f.command();
    await assert.rejects(
      f.txA(async (tx) => {
        await tx.courierCommand.create({ data });
        assert.equal(await tx.courier.count(), 1);
        throw new Error('rollback curier');
      }),
      /rollback curier/,
    );
    assert.equal(await f.txA((tx) => tx.courier.count()), 0);
    const created = await f.txA((tx) =>
      tx.courierCommand.create({
        data: {
          ...data,
          resultVersion: 999,
          resultStatus: 'ARCHIVED',
          availability: 'AVAILABLE',
          createdAt: new Date(0),
        },
      }),
    );
    assert.equal(created.resultVersion, 1);
    assert.equal(created.resultStatus, 'ACTIVE');
    assert.equal(created.availability, 'OFFLINE');
    assert.ok(created.createdAt.getTime() > 0);
    assert.equal((await f.current()).lastCommandId, created.id);
    await assert.rejects(f.txA((tx) => tx.courierCommand.create({ data })));
    await assert.rejects(
      f.txA((tx) => tx.courierCommand.create({ data: f.command({ courierId: randomUUID() }) })),
    );
    for (const [index, action] of ['UPDATE', 'ARCHIVE', 'RESTORE'].entries()) {
      await f.txA((tx) =>
        tx.courierCommand.create({
          data: f.command({
            action,
            expectedVersion: index + 1,
            profile: action === 'UPDATE' ? { vehicle: 'CAR', capacity: 3 } : undefined,
          }),
        }),
      );
    }
    const restored = await f.current();
    assert.equal(restored.version, 4);
    assert.equal(restored.status, 'ACTIVE');
    assert.equal(restored.availability, 'OFFLINE');
    assert.deepEqual(restored.profile, { vehicle: 'CAR', capacity: 3 });
    assert.deepEqual(
      await f.txA((tx) => tx.courierCommand.findUniqueOrThrow({ where: { id: created.id } })),
      created,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.courier.update({ where: { id: f.courierId }, data: { availability: 'AVAILABLE' } }),
      ),
    );
    await assert.rejects(f.txA((tx) => tx.courier.delete({ where: { id: f.courierId } })));
    await assert.rejects(
      f.txA((tx) =>
        tx.courierCommand.update({
          where: { id: created.id },
          data: { availability: 'AVAILABLE' },
        }),
      ),
    );
    await assert.rejects(f.txA((tx) => tx.courierCommand.delete({ where: { id: created.id } })));
  } finally {
    await f.close();
  }
});

test('PostgreSQL: RLS, contextul actorului, FK și registrul terminal izolează curierii', async () => {
  const f = await createCourierFixture();
  try {
    for (const patch of [
      { organizationId: f.b.organization.id },
      { locationId: f.locationB.id },
      { userId: f.b.user.id },
      { actorUserId: f.b.user.id },
      { profile: { vehicle: 'CAR', capacity: 0 } },
      { profile: { vehicle: 'CAR', capacity: 21 } },
      { profile: { vehicle: 'AIRPLANE', capacity: 1 } },
      { profile: { vehicle: 'CAR', capacity: 1, extra: true } },
    ])
      await assert.rejects(f.txA((tx) => tx.courierCommand.create({ data: f.command(patch) })));
    await f.txA((tx) => tx.courierCommand.create({ data: f.command() }));
    assert.equal(await f.runtime.courier.count(), 0);
    assert.equal(await f.runtime.courierCommand.count(), 0);
    assert.equal(await f.txB((tx) => tx.courier.count()), 0);
    assert.equal(await f.txB((tx) => tx.courierCommand.count()), 0);
    await assert.rejects(
      f.txA((tx) =>
        tx.courierCommand.create({
          data: f.command({
            action: 'ARCHIVE',
            locationId: f.locationA2.id,
            expectedVersion: 1,
            profile: undefined,
          }),
        }),
      ),
    );
    await assert.rejects(
      f.txA((tx) => tx.courierActivityGuard.updateMany({ data: { locationId: f.locationA2.id } })),
    );
    const requestKey = randomUUID(),
      courierId = randomUUID();
    await f.txA((tx) =>
      tx.courierCommand.create({
        data: f.command({
          requestKey,
          courierId,
          status: 'RETIRED',
          requestHash: null,
          userId: null,
          profile: undefined,
        }),
      }),
    );
    await assert.rejects(
      f.txA((tx) => tx.courierCommand.create({ data: f.command({ requestKey, courierId }) })),
    );
  } finally {
    await f.close();
  }
});

test('PostgreSQL: disponibilitatea și capacitatea limitează atribuirea fără a șterge livrări active', async () => {
  const f = await createCourierFixture();
  try {
    await f.txA((tx) => tx.courierCommand.create({ data: f.command() }));
    const orders = await Promise.all([f.delivery(), f.delivery(), f.delivery()]);
    const assign = (id: string) =>
      f.txA((tx) => writeDelivery(tx, id, { toStatus: 'ASSIGNED', courierUserId: f.a.user.id }));
    await assert.rejects(assign(orders[0]!.id), /unavailable/);
    await f.txA((tx) =>
      tx.courierCommand.create({
        data: f.command({
          action: 'SET_AVAILABILITY',
          expectedVersion: 1,
          availability: 'AVAILABLE',
          profile: undefined,
        }),
      }),
    );
    await assign(orders[0]!.id);
    await assign(orders[1]!.id);
    await assert.rejects(assign(orders[2]!.id), /capacity/);
    for (const patch of [
      { action: 'SET_AVAILABILITY', availability: 'OFFLINE', profile: undefined },
      { action: 'ARCHIVE', profile: undefined },
      { action: 'UPDATE', profile: { vehicle: 'BICYCLE', capacity: 1 } },
    ])
      await assert.rejects(
        f.txA((tx) =>
          tx.courierCommand.create({ data: f.command({ ...patch, expectedVersion: 2 }) }),
        ),
        /activity/,
      );
    await f.txA((tx) =>
      tx.courierCommand.create({
        data: f.command({
          action: 'SET_AVAILABILITY',
          expectedVersion: 2,
          availability: 'PAUSED',
          profile: undefined,
        }),
      }),
    );
    for (const order of orders.slice(0, 2))
      await f.txA((tx) =>
        writeDelivery(tx, order.id, { toStatus: 'FAILED', reason: 'Destinație indisponibilă' }),
      );
    await assert.rejects(assign(orders[2]!.id), /unavailable/);
    await f.txA((tx) =>
      tx.courierCommand.create({
        data: f.command({ action: 'ARCHIVE', expectedVersion: 3, profile: undefined }),
      }),
    );
    assert.equal((await f.current()).status, 'ARCHIVED');
    await assert.rejects(assign(orders[2]!.id), /unavailable/);
  } finally {
    await f.close();
  }
});
