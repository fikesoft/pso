import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import { createCourierFixture } from './fixtures/courier.fixture';
import { addressRace } from './fixtures/address-race.fixture';
import type { AddressRaceAction } from './fixtures/address-race.types';
import { writeDelivery } from './fixtures/delivery.fixture';
test('PostgreSQL: profilul și atribuirea concurează pe același guard inclusiv cu snapshot RR vechi', async (t) => {
  for (const isolation of ['ReadCommitted', 'RepeatableRead'] as const) {
    for (const race of [
      'ASSIGN_OFFLINE',
      'OFFLINE_ASSIGN',
      'ASSIGN_ARCHIVE',
      'ARCHIVE_ASSIGN',
      'ASSIGN_ASSIGN',
      'ASSIGN_CREATE',
      'CREATE_ASSIGN',
    ] as const) {
      await t.test(`${isolation}: ${race}`, async () => {
        const f = await createCourierFixture();
        const clients = [
          createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
          createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
        ];
        try {
          const creating = race.includes('CREATE');
          if (!creating) {
            await f.txA((tx) =>
              tx.courierCommand.create({
                data: f.command({ profile: { vehicle: 'CAR', capacity: 1 } }),
              }),
            );
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
          }
          const first = await f.delivery(),
            second = await f.delivery();
          const assign: AddressRaceAction = (tx) =>
            writeDelivery(tx, first.id, { toStatus: 'ASSIGNED', courierUserId: f.a.user.id });
          const assignSecond: AddressRaceAction = (tx) =>
            writeDelivery(tx, second.id, { toStatus: 'ASSIGNED', courierUserId: f.a.user.id });
          const action = race.includes('ARCHIVE')
            ? 'ARCHIVE'
            : race.includes('CREATE')
              ? 'CREATE'
              : 'SET_AVAILABILITY';
          const change: AddressRaceAction = (tx) =>
            tx.courierCommand.create({
              data:
                action === 'CREATE'
                  ? f.command()
                  : f.command({
                      action,
                      expectedVersion: 2,
                      availability: action === 'SET_AVAILABILITY' ? 'OFFLINE' : undefined,
                      profile: undefined,
                    }),
            });
          const actions =
            race === 'ASSIGN_ASSIGN'
              ? [assign, assignSecond]
              : race.startsWith('ASSIGN')
                ? [assign, change]
                : [change, assign];
          const outcomes = await addressRace(f, clients, isolation, actions);
          assert.equal(outcomes[1]!.status, 'rejected');
          const assigned = await f.txA((tx) =>
            tx.order.count({
              where: { deliveryCourierId: f.a.user.id, deliveryStatus: 'ASSIGNED' },
            }),
          );
          assert.equal(assigned, race.startsWith('ASSIGN') ? 1 : 0);
        } finally {
          await Promise.all([...clients.map((client) => client.$disconnect()), f.close()]);
        }
      });
    }
  }
});
