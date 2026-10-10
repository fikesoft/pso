import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import { createCustomerAddressFixture } from './fixtures/customer-address.fixture';
import { addressRace } from './fixtures/address-race.fixture';
import { deliveryZoneCommandData, deliveryZoneProfile } from './fixtures/delivery-zone.fixture';

test('PostgreSQL: zonele serializează versiuni, creare și retragere pe conexiuni distincte', async (t) => {
  const f = await createCustomerAddressFixture();
  const clients = [
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
  ];
  try {
    for (const isolation of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const race of [
        'UPDATE_ARCHIVE',
        'CREATE_CREATE',
        'RETIRE_CREATE',
        'CREATE_RETIRE',
      ] as const) {
        await t.test(`${isolation}: ${race}`, async () => {
          const create = deliveryZoneCommandData(f);
          if (race === 'UPDATE_ARCHIVE')
            await f.txA((tx) => tx.deliveryZoneCommand.create({ data: create }));
          const update = deliveryZoneCommandData(f, {
            zoneId: create.zoneId,
            action: 'UPDATE',
            expectedVersion: 1,
            profile: { ...deliveryZoneProfile(), deliveryFee: '30.00' },
          });
          const archive = deliveryZoneCommandData(f, {
            zoneId: create.zoneId,
            action: 'ARCHIVE',
            expectedVersion: 1,
            profile: undefined,
          });
          const retired = { ...create, status: 'RETIRED', requestHash: null, profile: undefined };
          const inputs =
            race === 'UPDATE_ARCHIVE'
              ? [update, archive]
              : race === 'CREATE_CREATE'
                ? [create, { ...create, requestKey: randomUUID() }]
                : race === 'RETIRE_CREATE'
                  ? [retired, create]
                  : [create, retired];
          const outcomes = await addressRace(
            f,
            clients,
            isolation,
            inputs.map((data) => (tx) => tx.deliveryZoneCommand.create({ data })),
          );
          assert.equal(outcomes[1]!.status, 'rejected');
          const zone = await f.txA((tx) =>
            tx.deliveryZone.findUnique({ where: { id: create.zoneId } }),
          );
          assert.equal(
            zone?.version ?? null,
            race === 'RETIRE_CREATE' ? null : race === 'UPDATE_ARCHIVE' ? 2 : 1,
          );
          const commands = await f.txA((tx) =>
            tx.deliveryZoneCommand.findMany({ where: { zoneId: create.zoneId } }),
          );
          assert.equal(commands.length, race === 'UPDATE_ARCHIVE' ? 2 : 1);
          assert.equal(
            commands.filter((command) => command.status === 'RETIRED').length,
            race === 'RETIRE_CREATE' ? 1 : 0,
          );
          if (zone) assert.equal(zone.status, 'ACTIVE');
        });
      }
    }
  } finally {
    await Promise.all([
      ...clients.map((client) => client.$disconnect()),
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
    ]);
  }
});
