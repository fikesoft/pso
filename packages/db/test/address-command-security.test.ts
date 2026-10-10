import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withTenantTransaction } from '../src';
import { addressData, createCustomerAddressFixture } from './fixtures/customer-address.fixture';
import { addressCommandData } from './fixtures/address-command.fixture';

test('PostgreSQL: comenzile și preferințele adreselor sunt izolate și cer proveniență atomică', async () => {
  const f = await createCustomerAddressFixture();
  try {
    const address = await f.txA((tx) => tx.customerAddress.create({ data: addressData(f) }));
    const body = addressCommandData(f, address.id);
    assert.equal(await f.runtime.customerAddressCommand.count(), 0);
    assert.equal(await f.runtime.customerAddressPreference.count(), 0);
    await assert.rejects(f.auth.customerAddressCommand.findMany(), /permission denied/);
    await assert.rejects(f.platform.customerAddressPreference.findMany(), /permission denied/);
    for (const changed of [
      { actorUserId: f.b.user.id },
      { locationId: f.locationB.id },
      { customerId: f.foreign.id },
      { organizationId: f.b.organization.id },
      { addressId: randomUUID() },
    ])
      await assert.rejects(
        f.txA((tx) => tx.customerAddressCommand.create({ data: { ...body, ...changed } })),
        /active scoped actor|matching scoped customer|row-level security/,
      );
    await assert.rejects(
      withTenantTransaction(f.runtime, { organizationId: f.a.organization.id }, (tx) =>
        tx.customerAddressCommand.create({ data: body }),
      ),
      /active scoped actor/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.customerAddressPreference.update({
          where: { customerId: f.customer.id },
          data: { defaultAddressId: address.id, version: 2 },
        }),
      ),
      /atomic immutable command/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.customerAddress.update({
          where: { id: address.id },
          data: { version: 2, privateDataEncrypted: 'b'.repeat(80) },
        }),
      ),
      /atomic immutable command/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.customerAddress.update({
          where: { id: address.id },
          data: { creationRequestHash: 'c'.repeat(64) },
        }),
      ),
      /permission denied/,
    );
    const retired = await f.txA((tx) =>
      tx.customerAddressCommand.create({
        data: {
          ...body,
          status: 'RETIRED',
          requestHash: null,
          expectedVersion: null,
          privateDataEncrypted: null,
          snapshotHash: null,
        },
      }),
    );
    assert.equal(retired.resultVersion, null);
    await assert.rejects(
      f.txA((tx) => tx.customerAddressCommand.create({ data: body })),
      /Unique constraint/,
    );
    const executed = await f.txA((tx) =>
      tx.customerAddressCommand.create({ data: { ...body, requestKey: randomUUID() } }),
    );
    assert.equal(await f.txB((tx) => tx.customerAddressCommand.count()), 0);
    assert.equal(
      await f.txB((tx) =>
        tx.customerAddressPreference.findUnique({ where: { customerId: f.customer.id } }),
      ),
      null,
    );
    for (const command of [retired, executed]) {
      await assert.rejects(
        f.txA((tx) =>
          tx.customerAddressCommand.update({
            where: { id: command.id },
            data: { action: 'ARCHIVE' },
          }),
        ),
        /permission denied/,
      );
      await assert.rejects(
        f.txA((tx) => tx.customerAddressCommand.delete({ where: { id: command.id } })),
        /permission denied/,
      );
    }
    await assert.rejects(
      f.txA((tx) =>
        tx.customerAddress.update({
          where: { id: address.id },
          data: { version: 3, lastCommandId: executed.id },
        }),
      ),
      /atomic immutable command/,
    );
    const selected = await f.txA((tx) =>
      tx.customerAddressCommand.create({
        data: {
          ...body,
          action: 'SET_DEFAULT',
          expectedVersion: 2,
          expectedPreferenceVersion: 1,
          privateDataEncrypted: null,
          snapshotHash: null,
          requestKey: randomUUID(),
        },
      }),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.customerAddressPreference.update({
          where: { customerId: f.customer.id },
          data: { version: 3, defaultAddressId: null, lastCommandId: selected.id },
        }),
      ),
      /atomic immutable command/,
    );
    await assert.rejects(
      f.txA((tx) => tx.customerAddressPreference.delete({ where: { customerId: f.customer.id } })),
      /permission denied/,
    );
    const flags = await f.runtime.$queryRaw<
      Array<{ name: string; forced: boolean; owner: string }>
    >`SELECT relname AS name,relforcerowsecurity AS forced,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relname IN ('CustomerAddressCommand','CustomerAddressPreference') ORDER BY relname`;
    assert.equal(flags.length, 2);
    for (const row of flags) {
      assert.equal(row.forced, true);
      assert.notEqual(row.owner, 'pos_runtime');
    }
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
