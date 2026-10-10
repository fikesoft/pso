import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { customerCommandData } from './fixtures/customer-command.fixture';
import { customerData, linkedContact } from './fixtures/customer.fixture';
import {
  createCustomerAddressFixture,
  addressData,
  addressOrderFields,
} from './fixtures/customer-address.fixture';
import { creationOrderData } from './fixtures/order-creation.fixture';

test('PostgreSQL: editarea și arhivarea CRM sunt atomice, cu istoric de comandă independent', async () => {
  const f = await createCustomerAddressFixture();
  const current = () =>
    f.txA((tx) => tx.customer.findUniqueOrThrow({ where: { id: f.customer.id } }));
  try {
    assert.equal(f.customer.status, 'ACTIVE');
    assert.equal(f.customer.updatedAt.getTime(), f.customer.createdAt.getTime());
    assert.equal(f.customer.updatedByUserId, f.a.user.id);
    const address = await f.txA((tx) => tx.customerAddress.create({ data: addressData(f) }));
    const order = await f.txA((tx) =>
      tx.order.create({
        data: creationOrderData(f, randomUUID(), addressOrderFields(f.customer.id, address.id)),
      }),
    );
    const edit = customerCommandData(f, f.customer.id, {
      action: 'UPDATE',
      privateDataEncrypted: Buffer.from(
        'synthetic-updated-authenticated-customer-profile-ciphertext',
      ).toString('base64url'),
      phoneLookupHash: 'd'.repeat(64),
      nameLookupHash: null,
    });
    await assert.rejects(
      f.txA(async (tx) => {
        await tx.customerCommand.create({ data: edit });
        assert.equal(
          (await tx.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).version,
          2,
        );
        throw new Error('rollback CRM');
      }),
      /rollback CRM/,
    );
    assert.deepEqual(await current(), f.customer);
    assert.equal(await f.txA((tx) => tx.customerCommand.count()), 0);
    const command = await f.txA((tx) =>
      tx.customerCommand.create({
        data: { ...edit, resultVersion: 99, resultStatus: 'ARCHIVED', createdAt: new Date(0) },
      }),
    );
    assert.equal(command.resultVersion, 2);
    assert.equal(command.resultStatus, 'ACTIVE');
    const updated = await current();
    assert.equal(updated.version, 2);
    assert.equal(updated.privateDataEncrypted, edit.privateDataEncrypted);
    assert.equal(updated.phoneLookupHash, edit.phoneLookupHash);
    assert.equal(updated.nameLookupHash, null);
    assert.equal(updated.lastCommandId, command.id);
    assert.equal(updated.updatedAt.getTime(), command.createdAt.getTime());
    assert.equal(updated.creationRequestHash, f.customer.creationRequestHash);
    assert.equal(updated.createdAt.getTime(), f.customer.createdAt.getTime());
    assert.deepEqual(
      await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } })),
      order,
    );
    const preserved = await f.txA((tx) =>
      tx.order.update({
        where: { id: order.id },
        data: { notes: 'Editare fără reselecție', version: { increment: 1 } },
      }),
    );
    assert.equal(preserved.customerVersionSnapshot, 1);
    assert.equal(preserved.customerDataEncrypted, order.customerDataEncrypted);
    await assert.rejects(
      f.txA((tx) =>
        tx.order.create({
          data: creationOrderData(f, randomUUID(), { number: 2, ...linkedContact(f.customer.id) }),
        }),
      ),
      /matching contact snapshot/,
    );
    await f.txA((tx) =>
      tx.customerCommand.create({
        data: customerCommandData(f, f.customer.id, { expectedVersion: 2 }),
      }),
    );
    assert.equal((await current()).status, 'ARCHIVED');
    await assert.rejects(
      f.txA((tx) => tx.customerAddress.create({ data: addressData(f) })),
      /active customer/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.order.create({
          data: creationOrderData(f, randomUUID(), {
            number: 2,
            ...linkedContact(f.customer.id, 3),
            customerPhoneLookupHash: updated.phoneLookupHash,
            customerNameLookupHash: null,
          }),
        }),
      ),
      /matching contact snapshot/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.customer.create({
          data: customerData(f, { phoneLookupHash: updated.phoneLookupHash }),
        }),
      ),
      /Unique constraint/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.customerCommand.create({
          data: { ...edit, expectedVersion: 3, requestKey: randomUUID() },
        }),
      ),
      /matching current state/,
    );
    await f.txA((tx) =>
      tx.customerCommand.create({
        data: customerCommandData(f, f.customer.id, { action: 'RESTORE', expectedVersion: 3 }),
      }),
    );
    assert.equal((await current()).status, 'ACTIVE');
    assert.equal((await current()).version, 4);
    assert.deepEqual(
      await f.txA((tx) => tx.customerAddress.findUniqueOrThrow({ where: { id: address.id } })),
      address,
    );
    await f.txA((tx) =>
      tx.order.create({
        data: creationOrderData(f, randomUUID(), {
          number: 2,
          ...linkedContact(f.customer.id, 4),
          customerPhoneLookupHash: updated.phoneLookupHash,
          customerNameLookupHash: null,
        }),
      }),
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
