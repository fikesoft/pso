import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { createStation, stationData, updateStation } from './fixtures/kitchen-station.fixture';
test('PostgreSQL: rutare versionată, izolată, cu stație locală și istoric imuabil', async () => {
  const f = await createOperationsFixture();
  try {
    const station = await f.txA((tx) => createStation(tx, stationData(f)));
    const body = {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      productId: f.catalogA.product.id,
      actorUserId: f.a.user.id,
      requestKey: randomUUID(),
      status: 'SUCCEEDED',
      requestHash: 'a'.repeat(64),
      expectedVersion: 0,
      resultVersion: 1,
      stationId: station.id,
    };
    await assert.rejects(f.txB((tx) => tx.kitchenRoutingCommand.create({ data: body })));
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenRoutingCommand.create({ data: { ...body, productId: f.catalogB.product.id } }),
      ),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenRoutingCommand.create({ data: { ...body, actorUserId: f.b.user.id } }),
      ),
    );
    const first = await f.txA((tx) =>
      tx.kitchenRoutingCommand.create({ data: { ...body, stationName: 'Fals' } }),
    );
    assert.equal(first.stationName, station.name);
    assert.equal(await f.runtime.kitchenRoutingCommand.count(), 0);
    assert.equal(await f.txB((tx) => tx.kitchenRoutingCommand.count()), 0);
    await assert.rejects(f.platform.kitchenRoutingCommand.count(), /permission denied/);
    await assert.rejects(
      f.txA((tx) => tx.kitchenRoutingCommand.deleteMany()),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) => tx.kitchenRoutingCommand.updateMany({ data: { stationName: 'Fals' } })),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenRoutingCommand.create({ data: { ...body, requestKey: randomUUID() } }),
      ),
      /version conflict/,
    );
    await f.txA((tx) => updateStation(tx, station.id, f.a.user.id, 'ARCHIVE'));
    await assert.rejects(
      f.txA((tx) =>
        tx.kitchenRoutingCommand.create({
          data: { ...body, requestKey: randomUUID(), expectedVersion: 1, resultVersion: 2 },
        }),
      ),
      /active station/,
    );
    const cleared = await f.txA((tx) =>
      tx.kitchenRoutingCommand.create({
        data: {
          ...body,
          requestKey: randomUUID(),
          expectedVersion: 1,
          resultVersion: 2,
          stationId: null,
        },
      }),
    );
    assert.equal(cleared.stationId, null);
    assert.deepEqual(
      await f.txA((tx) => tx.kitchenRoutingCommand.findUniqueOrThrow({ where: { id: first.id } })),
      first,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
