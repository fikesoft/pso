import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import { createCourierAcceptanceFixture } from './fixtures/courier-acceptance.fixture';
import { addressRace } from './fixtures/address-race.fixture';
import type { AddressRaceAction } from './fixtures/address-race.types';
import { writeDelivery } from './fixtures/delivery.fixture';
test('PostgreSQL: acceptare concurentă cu acceptare, retragere și modificarea livrării, inclusiv RR vechi', async (t) => {
  for (const isolation of ['ReadCommitted', 'RepeatableRead'] as const) {
    for (const race of [
      'ACCEPT_ACCEPT',
      'RETIRE_ACCEPT',
      'ACCEPT_RETIRE',
      'FAIL_ACCEPT',
    ] as const) {
      await t.test(`${isolation}: ${race}`, async () => {
        const f = await createCourierAcceptanceFixture();
        const clients = [
          createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
          createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
        ];
        try {
          const body = f.acceptance();
          const accept: AddressRaceAction = (tx) =>
            tx.courierAcceptanceCommand.create({ data: body });
          const retire: AddressRaceAction = (tx) =>
            tx.courierAcceptanceCommand.create({ data: { ...body, status: 'RETIRED' } });
          const fail: AddressRaceAction = (tx) =>
            writeDelivery(tx, f.order.id, { toStatus: 'FAILED', reason: 'Client indisponibil' });
          const actions =
            race === 'FAIL_ACCEPT'
              ? [fail, accept]
              : race === 'RETIRE_ACCEPT'
                ? [retire, accept]
                : race === 'ACCEPT_RETIRE'
                  ? [accept, retire]
                  : [
                      accept,
                      ((tx) =>
                        tx.courierAcceptanceCommand.create({
                          data: f.acceptance(),
                        })) as AddressRaceAction,
                    ];
          const results = await addressRace(f, clients, isolation, actions);
          assert.equal(results[1]!.status, 'rejected');
          assert.equal(
            await f.txA((tx) =>
              tx.courierAcceptanceCommand.count({ where: { status: 'SUCCEEDED' } }),
            ),
            race.startsWith('ACCEPT') ? 1 : 0,
          );
        } finally {
          await Promise.all([...clients.map((client) => client.$disconnect()), f.close()]);
        }
      });
    }
  }
});
