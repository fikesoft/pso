import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import { createOrderDeliveryFeeFixture } from './fixtures/order-delivery-fee.fixture';
import { deliveryZoneCommandData, deliveryZoneProfile } from './fixtures/delivery-zone.fixture';
import { addressRace } from './fixtures/address-race.fixture';

test('PostgreSQL: cotația nu supraviețuiește schimbării concurente a zonei sau priorității', async (t) => {
  for (const isolation of ['ReadCommitted', 'RepeatableRead'] as const) {
    for (const change of ['UPDATE', 'NEW_PRIORITY'] as const) {
      await t.test(`${isolation}: ${change}`, async () => {
        const f = await createOrderDeliveryFeeFixture();
        const clients = [
          createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
          createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
        ];
        try {
          const profile = {
            ...deliveryZoneProfile(),
            minimumOrder: '0.00',
            deliveryFee: '30.00',
            priority: 0,
          };
          const zone = deliveryZoneCommandData(
            f,
            change === 'UPDATE'
              ? { zoneId: f.zone.zoneId, action: 'UPDATE', expectedVersion: 1, profile }
              : { profile },
          );
          const outcomes = await addressRace(f, clients, isolation, [
            (tx) => tx.deliveryZoneCommand.create({ data: zone }),
            (tx) => tx.orderDeliveryFeeCommand.create({ data: f.command() }),
          ]);
          assert.equal(outcomes[1]!.status, 'rejected');
          assert.equal((await f.current()).deliveryFeeCommandId, null);
        } finally {
          await Promise.all([...clients.map((client) => client.$disconnect()), f.close()]);
        }
      });
    }
  }
});
