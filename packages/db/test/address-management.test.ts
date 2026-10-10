import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  createCustomerAddressFixture,
  addressData,
  addressOrderFields,
} from './fixtures/customer-address.fixture';
import { addressCommandData } from './fixtures/address-command.fixture';
import { creationOrderData } from './fixtures/order-creation.fixture';

test('PostgreSQL: adresar versionat, preferință atomică și snapshoturi independente', async () => {
  const f = await createCustomerAddressFixture();
  const preference = () =>
    f.txA((tx) =>
      tx.customerAddressPreference.findUniqueOrThrow({ where: { customerId: f.customer.id } }),
    );
  try {
    assert.equal((await preference()).version, 1);
    assert.equal((await preference()).defaultAddressId, null);
    const address = await f.txA((tx) => tx.customerAddress.create({ data: addressData(f) }));
    const other = await f.txA((tx) => tx.customerAddress.create({ data: addressData(f) }));
    const order = await f.txA((tx) =>
      tx.order.create({
        data: creationOrderData(f, randomUUID(), addressOrderFields(f.customer.id, address.id)),
      }),
    );
    const select = addressCommandData(f, address.id, {
      action: 'SET_DEFAULT',
      expectedPreferenceVersion: 1,
      privateDataEncrypted: null,
      snapshotHash: null,
    });
    const chosen = await f.txA((tx) => tx.customerAddressCommand.create({ data: select }));
    assert.equal(chosen.resultVersion, 1);
    assert.equal(chosen.resultPreferenceVersion, 2);
    assert.equal((await preference()).defaultAddressId, address.id);
    await assert.rejects(
      f.txA((tx) =>
        tx.customerAddressCommand.create({
          data: { ...select, requestKey: randomUUID(), addressId: other.id },
        }),
      ),
      /preference version/,
    );
    const edit = addressCommandData(f, address.id);
    await assert.rejects(
      f.txA(async (tx) => {
        await tx.customerAddressCommand.create({ data: edit });
        throw new Error('rollback address edit');
      }),
      /rollback address edit/,
    );
    assert.equal(
      await f.txA((tx) =>
        tx.customerAddressCommand.count({ where: { requestKey: edit.requestKey } }),
      ),
      0,
    );
    const edited = await f.txA((tx) => tx.customerAddressCommand.create({ data: edit }));
    assert.equal(edited.resultVersion, 2);
    assert.equal(edited.resultPreferenceVersion, 2);
    const current = await f.txA((tx) =>
      tx.customerAddress.findUniqueOrThrow({ where: { id: address.id } }),
    );
    assert.equal(current.creationRequestHash, address.creationRequestHash);
    assert.equal(current.createdAt.getTime(), address.createdAt.getTime());
    assert.equal(current.lastCommandId, edited.id);
    assert.deepEqual(
      await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } })),
      order,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.order.create({
          data: creationOrderData(f, randomUUID(), addressOrderFields(f.customer.id, address.id)),
        }),
      ),
      /active matching customer, version and snapshot/,
    );
    const archive = addressCommandData(f, address.id, {
      action: 'ARCHIVE',
      expectedVersion: 2,
      privateDataEncrypted: null,
      snapshotHash: null,
    });
    const archived = await f.txA((tx) => tx.customerAddressCommand.create({ data: archive }));
    assert.equal(archived.resultVersion, 3);
    assert.equal(archived.resultPreferenceVersion, 3);
    assert.equal(archived.resultDefaultAddressId, null);
    assert.equal((await preference()).defaultAddressId, null);
    assert.deepEqual(
      await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } })),
      order,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.customerAddressCommand.create({
          data: {
            ...select,
            expectedVersion: 3,
            expectedPreferenceVersion: 3,
            requestKey: randomUUID(),
          },
        }),
      ),
      /active customer, active address/,
    );
    const setOther = await f.txA((tx) =>
      tx.customerAddressCommand.create({
        data: {
          ...select,
          addressId: other.id,
          expectedPreferenceVersion: 3,
          requestKey: randomUUID(),
        },
      }),
    );
    assert.equal(setOther.resultPreferenceVersion, 4);
    const cleared = await f.txA((tx) =>
      tx.customerAddressCommand.create({
        data: {
          ...select,
          addressId: other.id,
          action: 'CLEAR_DEFAULT',
          expectedPreferenceVersion: 4,
          requestKey: randomUUID(),
        },
      }),
    );
    assert.equal(cleared.resultPreferenceVersion, 5);
    assert.equal(cleared.resultVersion, 1);
    assert.equal((await preference()).defaultAddressId, null);
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
