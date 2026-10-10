import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import { createCustomerAddressFixture, addressData } from './fixtures/customer-address.fixture';
import { addressCommandData } from './fixtures/address-command.fixture';
import { addressRace } from './fixtures/address-race.fixture';
import { customerData } from './fixtures/customer.fixture';

test('PostgreSQL: preferințe concurente, editare/arhivare și execuție/retragere', async (t) => {
  const f = await createCustomerAddressFixture();
  const clients = [
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
  ];
  try {
    let number = 0;
    for (const isolation of ['ReadCommitted', 'RepeatableRead'] as const)
      for (const race of [
        'DEFAULT_DEFAULT',
        'UPDATE_ARCHIVE',
        'RETIRE_UPDATE',
        'UPDATE_RETIRE',
      ] as const)
        await t.test(`${isolation}: ${race}`, async () => {
          const customer = await f.txA((tx) =>
            tx.customer.create({
              data: customerData(f, { phoneLookupHash: (++number).toString(16).padStart(64, '0') }),
            }),
          );
          const address = await f.txA((tx) =>
            tx.customerAddress.create({ data: addressData(f, { customerId: customer.id }) }),
          );
          const other = await f.txA((tx) =>
            tx.customerAddress.create({ data: addressData(f, { customerId: customer.id }) }),
          );
          const edit = addressCommandData(f, address.id, { customerId: customer.id });
          const archive = {
            ...edit,
            action: 'ARCHIVE',
            privateDataEncrypted: null,
            snapshotHash: null,
            requestKey: randomUUID(),
          };
          const retired = {
            ...edit,
            status: 'RETIRED',
            expectedVersion: null,
            requestHash: null,
            privateDataEncrypted: null,
            snapshotHash: null,
          };
          const select = { ...archive, action: 'SET_DEFAULT', expectedPreferenceVersion: 1 };
          const actions =
            race === 'DEFAULT_DEFAULT'
              ? [select, { ...select, addressId: other.id, requestKey: randomUUID() }]
              : race === 'UPDATE_ARCHIVE'
                ? [edit, archive]
                : race === 'RETIRE_UPDATE'
                  ? [retired, edit]
                  : [edit, retired];
          const results = await addressRace(
            f,
            clients,
            isolation,
            actions.map((data) => (tx) => tx.customerAddressCommand.create({ data })),
          );
          assert.equal(results[1]!.status, 'rejected');
          const current = await f.txA((tx) =>
            tx.customerAddress.findUniqueOrThrow({ where: { id: address.id } }),
          );
          assert.equal(
            current.version,
            race === 'UPDATE_ARCHIVE' || race === 'UPDATE_RETIRE' ? 2 : 1,
          );
          assert.equal(current.status, 'ACTIVE');
          const preference = await f.txA((tx) =>
            tx.customerAddressPreference.findUniqueOrThrow({ where: { customerId: customer.id } }),
          );
          assert.equal(preference.version, race === 'DEFAULT_DEFAULT' ? 2 : 1);
          assert.equal(preference.defaultAddressId, race === 'DEFAULT_DEFAULT' ? address.id : null);
          const commands = await f.txA((tx) =>
            tx.customerAddressCommand.findMany({ where: { customerId: customer.id } }),
          );
          assert.equal(commands.length, 1);
          assert.equal(commands[0]!.status, race === 'RETIRE_UPDATE' ? 'RETIRED' : 'SUCCEEDED');
        });
  } finally {
    await Promise.all([
      ...clients.map((client) => client.$disconnect()),
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
    ]);
  }
});
