import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import { createCustomerAddressFixture } from './fixtures/customer-address.fixture';
import { addressRace } from './fixtures/address-race.fixture';
import { customerCommandData } from './fixtures/customer-command.fixture';
import { customerData } from './fixtures/customer.fixture';

test('PostgreSQL: versiuni CRM concurente și execuție/retragere pe aceeași cheie', async (t) => {
  const f = await createCustomerAddressFixture();
  const clients = [
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
  ];
  try {
    let number = 0;
    for (const isolation of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const race of ['UPDATE_ARCHIVE', 'RETIRE_EXECUTE', 'EXECUTE_RETIRE'] as const) {
        await t.test(`${isolation}: ${race}`, async () => {
          const customer = await f.txA((tx) =>
            tx.customer.create({
              data: customerData(f, { phoneLookupHash: (++number).toString(16).padStart(64, '0') }),
            }),
          );
          const archive = customerCommandData(f, customer.id);
          const edit = {
            ...archive,
            action: 'UPDATE',
            requestKey: randomUUID(),
            privateDataEncrypted: customer.privateDataEncrypted,
            phoneLookupHash: 'f'.repeat(63) + number.toString(16),
            nameLookupHash: null,
          };
          const retired = {
            ...archive,
            status: 'RETIRED',
            requestHash: null,
            expectedVersion: null,
          };
          const actions =
            race === 'UPDATE_ARCHIVE'
              ? [edit, archive]
              : race === 'RETIRE_EXECUTE'
                ? [retired, archive]
                : [archive, retired];
          const results = await addressRace(
            f,
            clients,
            isolation,
            actions.map((data) => (tx) => tx.customerCommand.create({ data })),
          );
          assert.equal(results[1]!.status, 'rejected');
          const current = await f.txA((tx) =>
            tx.customer.findUniqueOrThrow({ where: { id: customer.id } }),
          );
          assert.equal(current.version, race === 'RETIRE_EXECUTE' ? 1 : 2);
          assert.equal(current.status, race === 'EXECUTE_RETIRE' ? 'ARCHIVED' : 'ACTIVE');
          const commands = await f.txA((tx) =>
            tx.customerCommand.findMany({ where: { customerId: customer.id } }),
          );
          assert.equal(commands.length, 1);
          assert.equal(commands[0]!.status, race === 'RETIRE_EXECUTE' ? 'RETIRED' : 'SUCCEEDED');
          assert.equal(commands[0]!.action, race === 'UPDATE_ARCHIVE' ? 'UPDATE' : 'ARCHIVE');
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
