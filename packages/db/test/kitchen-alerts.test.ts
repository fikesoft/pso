import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient, withTenantTransaction } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { createStation, stationData } from './fixtures/kitchen-station.fixture';

test('PostgreSQL: reguli KDS izolate, versionate, cu ținte valide și istoric imuabil', async () => {
  const f = await createOperationsFixture();
  try {
    const station = await f.txA((tx) => createStation(tx, stationData(f)));
    const body = {
      organizationId: f.a.organization.id,
      scopeType: 'ORGANIZATION',
      targetKind: 'DEFAULT',
      actorUserId: f.a.user.id,
      requestKey: randomUUID(),
      status: 'SUCCEEDED',
      requestHash: 'a'.repeat(64),
      expectedVersion: 0,
      resultVersion: 1,
      warningSeconds: 600,
      criticalSeconds: 900,
    };
    const first = await f.txA((tx) => tx.kitchenAlertCommand.create({ data: body }));
    assert.equal(await f.runtime.kitchenAlertCommand.count(), 0);
    assert.equal(await f.txB((tx) => tx.kitchenAlertCommand.count()), 0);
    assert.equal(await f.txA((tx) => tx.kitchenAlertCommand.count()), 1);
    await assert.rejects(f.txB((tx) => tx.kitchenAlertCommand.create({ data: body })));
    await assert.rejects(f.platform.kitchenAlertCommand.count(), /permission denied/);
    await assert.rejects(f.auth.kitchenAlertCommand.count(), /permission denied/);
    await assert.rejects(
      f.txA((tx) => tx.kitchenAlertCommand.deleteMany()),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) => tx.kitchenAlertCommand.updateMany({ data: { warningSeconds: 10 } })),
      /permission denied/,
    );
    // New identities keep invalid shape/FK checks independent from the version guard.
    for (const override of [
      { scopeType: 'LOCATION' },
      { scopeType: 'LOCATION', locationId: f.locationB.id },
      { locationId: f.locationA.id },
      { targetKind: 'STATION', stationId: station.id },
      { targetKind: 'PRODUCT', productId: f.catalogB.product.id },
      { targetKind: 'CATEGORY', categoryId: f.catalogB.category.id },
      { targetKind: 'DEFAULT', productId: f.catalogA.product.id },
      {
        targetKind: 'CATEGORY',
        categoryId: f.catalogA.category.id,
        productId: f.catalogA.product.id,
      },
      {
        targetKind: 'STATION',
        scopeType: 'LOCATION',
        locationId: f.locationA2.id,
        stationId: station.id,
      },
      {
        targetKind: 'PRODUCT',
        scopeType: 'LOCATION',
        locationId: f.locationA2.id,
        productId: f.catalogA.product.id,
      },
      { actorUserId: f.b.user.id, targetKind: 'PRODUCT', productId: f.catalogA.product.id },
    ]) {
      await assert.rejects(
        f.txA((tx) =>
          tx.kitchenAlertCommand.create({
            data: { ...body, requestKey: randomUUID(), ...override },
          }),
        ),
      );
    }
    for (const override of [
      { warningSeconds: 0 },
      { warningSeconds: 900 },
      { criticalSeconds: 599 },
      { criticalSeconds: 86401 },
      { warningSeconds: null },
      { criticalSeconds: null },
      { requestHash: 'invalid' },
      { expectedVersion: -1 },
      { resultVersion: 3 },
      { status: 'RETIRED' },
    ]) {
      await assert.rejects(
        f.txA((tx) =>
          tx.kitchenAlertCommand.create({
            data: {
              ...body,
              requestKey: randomUUID(),
              expectedVersion: 1,
              resultVersion: 2,
              ...override,
            },
          }),
        ),
      );
    }
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenAlertCommand.create({
          data: { ...body, requestKey: randomUUID() },
        }),
      ),
      /version conflict/,
    );
    const retired = await f.txA((tx) =>
      tx.kitchenAlertCommand.create({
        data: {
          organizationId: body.organizationId,
          scopeType: body.scopeType,
          targetKind: body.targetKind,
          actorUserId: body.actorUserId,
          requestKey: randomUUID(),
          status: 'RETIRED',
        },
      }),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenAlertCommand.create({
          data: {
            ...body,
            requestKey: retired.requestKey,
            expectedVersion: 1,
            resultVersion: 2,
          },
        }),
      ),
      /Unique constraint/,
    );
    const inherited = await f.txA((tx) =>
      tx.kitchenAlertCommand.create({
        data: {
          ...body,
          requestKey: randomUUID(),
          expectedVersion: 1,
          resultVersion: 2,
          warningSeconds: null,
          criticalSeconds: null,
        },
      }),
    );
    assert.equal(inherited.resultVersion, 2);
    assert.equal(inherited.warningSeconds, null);
    assert.deepEqual(
      await f.txA((tx) =>
        tx.kitchenAlertCommand.findUniqueOrThrow({
          where: { id: first.id },
        }),
      ),
      first,
    );
    for (const target of [
      { targetKind: 'PRODUCT', productId: f.catalogA.product.id },
      { targetKind: 'CATEGORY', categoryId: f.catalogA.category.id },
      { targetKind: 'DEFAULT' },
      { targetKind: 'STATION', stationId: station.id },
    ]) {
      const local = await f.txA((tx) =>
        tx.kitchenAlertCommand.create({
          data: {
            ...body,
            ...target,
            scopeType: 'LOCATION',
            locationId: f.locationA.id,
            requestKey: randomUUID(),
          },
        }),
      );
      assert.equal(local.resultVersion, 1);
    }
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});

test('PostgreSQL: o singură modificare concurentă câștigă versiunea organizațională fără locație', async () => {
  const f = await createOperationsFixture();
  const concurrent = createDatabaseClient(process.env.TEST_DATABASE_URL!, 2);
  try {
    const create = () =>
      withTenantTransaction(
        concurrent,
        {
          organizationId: f.a.organization.id,
          userId: f.a.user.id,
        },
        (tx) =>
          tx.kitchenAlertCommand.create({
            data: {
              organizationId: f.a.organization.id,
              actorUserId: f.a.user.id,
              scopeType: 'ORGANIZATION',
              targetKind: 'DEFAULT',
              requestKey: randomUUID(),
              status: 'SUCCEEDED',
              requestHash: 'a'.repeat(64),
              expectedVersion: 0,
              resultVersion: 1,
              warningSeconds: 600,
              criticalSeconds: 900,
            },
          }),
      );
    const outcomes = await Promise.allSettled([create(), create()]);
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(await f.txA((tx) => tx.kitchenAlertCommand.count()), 1);
  } finally {
    await Promise.all([
      concurrent.$disconnect(),
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
    ]);
  }
});
