import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import type { TenantTransaction } from '../src';
import {
  createCustomerAddressFixture,
  addressData,
  addressOrderFields,
  archiveAddress,
} from './fixtures/customer-address.fixture';
import { creationOrderData } from './fixtures/order-creation.fixture';
import { addressRace } from './fixtures/address-race.fixture';
test('PostgreSQL real: arhivarea și selectarea adresei se serializează fără istorie falsă', async (t) => {
  const f = await createCustomerAddressFixture();
  const clients = [
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
  ];
  let number = 0;
  try {
    for (const isolation of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const mode of ['ARCHIVE_ARCHIVE', 'SELECT_ARCHIVE', 'ARCHIVE_SELECT'] as const) {
        await t.test(`${isolation}: ${mode}`, async () => {
          const address = await f.txA((tx) => tx.customerAddress.create({ data: addressData(f) }));
          const key = randomUUID(),
            orderNumber = ++number;
          const archive = (tx: TenantTransaction) => archiveAddress(tx, f, address.id);
          const select = (tx: TenantTransaction) =>
            tx.order.create({
              data: creationOrderData(f, key, {
                number: orderNumber,
                ...addressOrderFields(f.customer.id, address.id),
              }),
            });
          const actions =
            mode === 'ARCHIVE_ARCHIVE'
              ? [archive, archive]
              : mode === 'SELECT_ARCHIVE'
                ? [select, archive]
                : [archive, select];
          const results = await addressRace(f, clients, isolation, actions);
          const second = results[1]!;
          if (mode === 'SELECT_ARCHIVE') assert.equal(second.status, 'fulfilled');
          else {
            assert.equal(second.status, 'rejected');
            if (second.status === 'rejected')
              assert.match(
                String(second.reason),
                isolation === 'RepeatableRead'
                  ? /write conflict|serialization/i
                  : mode === 'ARCHIVE_ARCHIVE'
                    ? /atomic immutable command|active customer, active address/
                    : /active matching customer/,
              );
          }
          const current = await f.txA((tx) =>
            tx.customerAddress.findUniqueOrThrow({ where: { id: address.id } }),
          );
          assert.equal(current.status, 'ARCHIVED');
          assert.equal(current.version, 2);
          const orders = await f.txA((tx) =>
            tx.order.findMany({ where: { clientRequestId: key } }),
          );
          assert.equal(orders.length, mode === 'SELECT_ARCHIVE' ? 1 : 0);
          if (orders[0]) {
            assert.equal(orders[0].customerAddressVersionSnapshot, 1);
            const updated = await f.txA((tx) =>
              tx.order.update({
                where: { id: orders[0]!.id },
                data: { notes: 'Actualizare după arhivare', version: { increment: 1 } },
              }),
            );
            assert.equal(updated.deliveryAddressEncrypted, orders[0].deliveryAddressEncrypted);
          }
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
