import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { responsibilityRace } from './fixtures/responsibility-race.fixture';
import {
  createKitchenStationFixture,
  createStation,
  stationData,
  updateStation,
  retireStation,
} from './fixtures/kitchen-station.fixture';
test('PostgreSQL: stațiile serializează execuția și retragerea cheii', async (t) => {
  const f = await createKitchenStationFixture();
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const mode of [
        'CREATE_RETIRE',
        'RETIRE_CREATE',
        'UPDATE_RETIRE',
        'RETIRE_UPDATE',
      ] as const) {
        await t.test(`${isolationLevel}: ${mode}`, async () => {
          const key = randomUUID();
          const updating = mode.includes('UPDATE');
          const row = updating ? await f.txA((tx) => createStation(tx, stationData(f))) : undefined;
          const data = stationData(f, { creationRequestKey: key, lastRequestKey: key });
          const retiredFirst = mode.startsWith('RETIRE');
          const result = await responsibilityRace({
            organizationId: f.a.organization.id,
            actor: f.a.user.id,
            isolationLevel,
            snapshot: (tx) => tx.kitchenStation.count(),
            winner: (tx) =>
              retiredFirst
                ? retireStation(tx, f, key, row?.id)
                : row
                  ? updateStation(tx, row.id, f.a.user.id, 'UPDATE', key)
                  : createStation(tx, data),
            loser: (tx) =>
              !retiredFirst
                ? retireStation(tx, f, key, row?.id)
                : row
                  ? updateStation(tx, row.id, f.a.user.id, 'UPDATE', key)
                  : createStation(tx, data),
          });
          assert.equal(result.status, 'rejected');
          if (result.status === 'rejected')
            assert.match(
              String(result.reason),
              /unique|constraint|serializ|write conflict|cannot retire/i,
            );
          const command = await f.txA((tx) =>
            tx.kitchenStationCommand.findFirstOrThrow({ where: { requestKey: key } }),
          );
          assert.equal(command.status, retiredFirst ? 'RETIRED' : 'SUCCEEDED');
          if (row)
            assert.equal(
              (await f.txA((tx) => tx.kitchenStation.findUniqueOrThrow({ where: { id: row.id } })))
                .version,
              retiredFirst ? 1 : 2,
            );
          else
            assert.equal(
              await f.txA((tx) => tx.kitchenStation.count({ where: { creationRequestKey: key } })),
              retiredFirst ? 0 : 1,
            );
        });
      }
    }
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
