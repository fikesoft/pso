import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  createDeliveryZoneFixture,
  deliveryZoneCommandData,
  deliveryZoneProfile,
} from './fixtures/delivery-zone.fixture';

test('PostgreSQL: zonele se creează/editează/arhivează/restaurează atomic, păstrând istoricul', async () => {
  const f = await createDeliveryZoneFixture();
  try {
    const input = deliveryZoneCommandData(f);
    const current = () =>
      f.txA((tx) => tx.deliveryZone.findUniqueOrThrow({ where: { id: input.zoneId } }));
    await assert.rejects(
      f.txA(async (tx) => {
        await tx.deliveryZoneCommand.create({ data: input });
        assert.equal(await tx.deliveryZone.count(), 1);
        throw new Error('rollback zonă');
      }),
      /rollback zonă/,
    );
    assert.equal(await f.txA((tx) => tx.deliveryZone.count()), 0);
    const created = await f.txA((tx) =>
      tx.deliveryZoneCommand.create({
        data: { ...input, resultVersion: 99, resultStatus: 'ARCHIVED', createdAt: new Date(0) },
      }),
    );
    assert.equal(created.resultVersion, 1);
    assert.equal(created.resultStatus, 'ACTIVE');
    assert.ok(created.createdAt.getTime() > 0);
    const first = await current();
    assert.equal(first.lastCommandId, created.id);
    const update = await f.txA((tx) =>
      tx.deliveryZoneCommand.create({
        data: deliveryZoneCommandData(f, {
          zoneId: input.zoneId,
          action: 'UPDATE',
          expectedVersion: 1,
          profile: { ...deliveryZoneProfile(), deliveryFee: '30.00' },
        }),
      }),
    );
    assert.equal(update.resultVersion, 2);
    assert.equal((await current()).version, 2);
    const archived = await f.txA((tx) =>
      tx.deliveryZoneCommand.create({
        data: deliveryZoneCommandData(f, {
          zoneId: input.zoneId,
          action: 'ARCHIVE',
          expectedVersion: 2,
          profile: undefined,
        }),
      }),
    );
    assert.equal(archived.resultStatus, 'ARCHIVED');
    assert.deepEqual(archived.profile, update.profile);
    assert.equal((await current()).status, 'ARCHIVED');
    await assert.rejects(
      f.txA((tx) =>
        tx.deliveryZoneCommand.create({
          data: deliveryZoneCommandData(f, {
            zoneId: input.zoneId,
            action: 'UPDATE',
            expectedVersion: 3,
          }),
        }),
      ),
    );
    await f.txA((tx) =>
      tx.deliveryZoneCommand.create({
        data: deliveryZoneCommandData(f, {
          zoneId: input.zoneId,
          action: 'RESTORE',
          expectedVersion: 3,
          profile: undefined,
        }),
      }),
    );
    const restored = await current();
    assert.equal(restored.status, 'ACTIVE');
    assert.equal(restored.version, 4);
    assert.equal(restored.createdAt.getTime(), first.createdAt.getTime());
    assert.deepEqual(
      await f.txA((tx) => tx.deliveryZoneCommand.findUniqueOrThrow({ where: { id: created.id } })),
      created,
    );
    await assert.rejects(f.txA((tx) => tx.deliveryZoneCommand.create({ data: input })));
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});

test('PostgreSQL: RLS, contextul actorului, FK compuse și registrul terminal protejează zonele', async () => {
  const f = await createDeliveryZoneFixture();
  try {
    const input = deliveryZoneCommandData(f);
    const created = await f.txA((tx) => tx.deliveryZoneCommand.create({ data: input }));
    const zone = await f.txA((tx) =>
      tx.deliveryZone.findUniqueOrThrow({ where: { id: input.zoneId } }),
    );
    assert.equal(await f.runtime.deliveryZone.count(), 0);
    assert.equal(await f.runtime.deliveryZoneCommand.count(), 0);
    assert.equal(await f.txB((tx) => tx.deliveryZone.count()), 0);
    assert.equal(await f.txB((tx) => tx.deliveryZoneCommand.count()), 0);
    for (const changes of [
      { locationId: f.locationB.id },
      { actorUserId: f.b.user.id },
      { organizationId: f.b.organization.id },
    ])
      await assert.rejects(
        f.txA((tx) => tx.deliveryZoneCommand.create({ data: deliveryZoneCommandData(f, changes) })),
      );
    await assert.rejects(
      f.txA((tx) =>
        tx.deliveryZoneCommand.create({
          data: deliveryZoneCommandData(f, {
            zoneId: zone.id,
            locationId: f.locationA2.id,
            action: 'ARCHIVE',
            expectedVersion: 1,
          }),
        }),
      ),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.deliveryZone.update({
          where: { id: zone.id },
          data: { profile: { ...deliveryZoneProfile(), deliveryFee: '0.00' } },
        }),
      ),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.deliveryZone.create({
          data: { ...zone, profile: deliveryZoneProfile(), id: randomUUID() },
        }),
      ),
    );
    await assert.rejects(f.txA((tx) => tx.deliveryZone.delete({ where: { id: zone.id } })));
    await assert.rejects(
      f.txA((tx) => tx.deliveryZoneCommand.delete({ where: { id: created.id } })),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.deliveryZoneCommand.update({
          where: { id: created.id },
          data: { requestHash: 'b'.repeat(64) },
        }),
      ),
    );
    const retiredInput = deliveryZoneCommandData(f, {
      status: 'RETIRED',
      requestHash: null,
      profile: undefined,
    });
    const retired = await f.txA((tx) => tx.deliveryZoneCommand.create({ data: retiredInput }));
    assert.equal(retired.resultZoneId, null);
    assert.equal(await f.txA((tx) => tx.deliveryZone.count()), 1);
    await assert.rejects(
      f.txA((tx) =>
        tx.deliveryZoneCommand.create({
          data: {
            ...retiredInput,
            status: 'SUCCEEDED',
            requestHash: 'a'.repeat(64),
            profile: deliveryZoneProfile(),
          },
        }),
      ),
    );
    assert.deepEqual(
      await f.txA((tx) => tx.deliveryZone.findUniqueOrThrow({ where: { id: zone.id } })),
      zone,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});

test('PostgreSQL: geometria și programul sunt validate și pentru inserări runtime directe', async () => {
  const f = await createDeliveryZoneFixture();
  try {
    const polygon = [
      { latitude: 47, longitude: 28 },
      { latitude: 47, longitude: 29 },
      { latitude: 48, longitude: 29 },
      { latitude: 48, longitude: 28 },
    ];
    const profile = deliveryZoneProfile();
    await f.txA((tx) =>
      tx.deliveryZoneCommand.create({
        data: deliveryZoneCommandData(f, {
          profile: {
            ...profile,
            shape: { type: 'POLYGON', vertices: polygon },
            activeHours: [{ weekday: 1, startMinute: 0, endMinute: 1440 }],
          },
        }),
      }),
    );
    const invalid = [
      { ...profile, name: '\t' },
      { ...profile, name: 'Centru\n' },
      { ...profile, freeDeliveryFrom: '99.99' },
      { ...profile, deliveryFee: '-0.01' },
      { ...profile, extra: 'hidden' },
      {
        ...profile,
        shape: { type: 'RADIUS', center: { latitude: 91, longitude: 28 }, radiusMeters: 1 },
      },
      {
        ...profile,
        shape: { type: 'POLYGON', vertices: [polygon[0], polygon[2], polygon[1], polygon[3]] },
      },
      { ...profile, shape: { type: 'POLYGON', vertices: [...polygon, polygon[0]] } },
      { ...profile, activeHours: [{ weekday: 1, startMinute: 600, endMinute: 500 }] },
      {
        ...profile,
        activeHours: [
          { weekday: 1, startMinute: 0, endMinute: 600 },
          { weekday: 1, startMinute: 599, endMinute: 700 },
        ],
      },
    ];
    for (const value of invalid)
      await assert.rejects(
        f.txA((tx) =>
          tx.deliveryZoneCommand.create({
            data: deliveryZoneCommandData(f, { profile: value }),
          }),
        ),
      );
    assert.equal(await f.txA((tx) => tx.deliveryZone.count()), 1);
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
