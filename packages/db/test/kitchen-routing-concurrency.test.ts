import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { responsibilityRace } from './fixtures/responsibility-race.fixture';
import { createStation, stationData, updateStation } from './fixtures/kitchen-station.fixture';
test('PostgreSQL: rutarea serializează versiunile, retragerea și arhivarea stației', async (t) => {
  const f = await createOperationsFixture();
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const mode of ['SET_SET', 'SET_RETIRE', 'RETIRE_SET', 'ARCHIVE_SET'] as const) {
        await t.test(`${isolationLevel}: ${mode}`, async () => {
          const station = await f.txA((tx) => createStation(tx, stationData(f)));
          const current = await f.txA((tx) =>
            tx.kitchenRoutingCommand.aggregate({
              where: { productId: f.catalogA.product.id, status: 'SUCCEEDED' },
              _max: { resultVersion: true },
            }),
          );
          const version = current._max.resultVersion ?? 0;
          const key = randomUUID();
          const identity = {
            organizationId: f.a.organization.id,
            locationId: f.locationA.id,
            productId: f.catalogA.product.id,
            actorUserId: f.a.user.id,
            requestKey: key,
          };
          const set = {
            ...identity,
            status: 'SUCCEEDED',
            requestHash: 'c'.repeat(64),
            expectedVersion: version,
            resultVersion: version + 1,
            stationId: station.id,
          };
          const retired = { ...identity, status: 'RETIRED' };
          const result = await responsibilityRace({
            organizationId: f.a.organization.id,
            actor: f.a.user.id,
            isolationLevel,
            snapshot: (tx) => tx.kitchenRoutingCommand.count(),
            winner: (tx) =>
              mode === 'ARCHIVE_SET'
                ? updateStation(tx, station.id, f.a.user.id, 'ARCHIVE')
                : tx.kitchenRoutingCommand.create({ data: mode === 'RETIRE_SET' ? retired : set }),
            loser: (tx) =>
              tx.kitchenRoutingCommand.create({
                data:
                  mode === 'SET_RETIRE'
                    ? retired
                    : { ...set, ...(mode === 'SET_SET' ? { requestKey: randomUUID() } : {}) },
              }),
          });
          assert.equal(result.status, 'rejected');
          if (result.status === 'rejected')
            assert.match(
              String(result.reason),
              /unique|constraint|serializ|write conflict|version conflict|active station/i,
            );
          const after = await f.txA((tx) =>
            tx.kitchenRoutingCommand.aggregate({
              where: { productId: f.catalogA.product.id, status: 'SUCCEEDED' },
              _max: { resultVersion: true },
            }),
          );
          assert.equal(
            after._max.resultVersion ?? 0,
            mode.startsWith('SET') ? version + 1 : version,
          );
          if (mode !== 'ARCHIVE_SET') {
            const saved = await f.txA((tx) =>
              tx.kitchenRoutingCommand.findFirstOrThrow({ where: { requestKey: key } }),
            );
            assert.equal(saved.status, mode === 'RETIRE_SET' ? 'RETIRED' : 'SUCCEEDED');
          }
        });
      }
    }
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
