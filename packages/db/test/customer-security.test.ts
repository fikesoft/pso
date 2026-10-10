import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withTenantTransaction } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { customerData, linkedContact } from './fixtures/customer.fixture';
import { creationOrderData } from './fixtures/order-creation.fixture';

test('PostgreSQL real: profil explicit, RLS, actor și snapshoturi imutabile', async (t) => {
  const f = await createOperationsFixture();
  try {
    const customer = await f.txA((tx) =>
      tx.customer.create({
        data: customerData(f, { createdAt: new Date('2000-01-01'), version: 99 }),
      }),
    );
    await t.test(
      'data/versiunea sunt server-side, fără acces implicit din alt tenant sau fără context',
      async () => {
        assert.equal(customer.version, 1);
        assert.ok(customer.createdAt > new Date('2020-01-01'));
        assert.equal(await f.runtime.customer.count(), 0);
        assert.equal(
          await f.txB((tx) => tx.customer.findUnique({ where: { id: customer.id } })),
          null,
        );
        await assert.rejects(f.auth.customer.findMany(), /permission denied/);
        await assert.rejects(f.platform.customer.findMany(), /permission denied/);
        const samePhone = await f.txB((tx) =>
          tx.customer.create({
            data: customerData(f, {
              organizationId: f.b.organization.id,
              createdLocationId: f.locationB.id,
              createdByUserId: f.b.user.id,
            }),
          }),
        );
        assert.equal(samePhone.phoneLookupHash, customer.phoneLookupHash);
      },
    );
    await t.test(
      'UPDATE/DELETE și actorii/locațiile falsificate sunt respinse atomic',
      async () => {
        await assert.rejects(
          f.txA((tx) =>
            tx.customer.update({
              where: { id: customer.id },
              data: { nameLookupHash: 'd'.repeat(64) },
            }),
          ),
          /atomic immutable command/,
        );
        await assert.rejects(
          f.txA((tx) => tx.customer.delete({ where: { id: customer.id } })),
          /permission denied/,
        );
        for (const data of [
          customerData(f, { createdByUserId: f.b.user.id }),
          customerData(f, { createdLocationId: f.locationB.id }),
          customerData(f, { organizationId: f.b.organization.id }),
          customerData(f, { privateDataEncrypted: 'Client necriptat +373000000' }),
          customerData(f, { phoneLookupHash: 'not-a-hash' }),
        ])
          await assert.rejects(
            f.txA((tx) => tx.customer.create({ data })),
            /scoped actor|row-level security|check constraint/,
          );
        await assert.rejects(
          withTenantTransaction(f.runtime, { organizationId: f.a.organization.id }, (tx) =>
            tx.customer.create({ data: customerData(f) }),
          ),
          /scoped actor/,
        );
        await f.txA((tx) =>
          tx.location.update({ where: { id: f.locationA2.id }, data: { status: 'DISABLED' } }),
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.customer.create({ data: customerData(f, { createdLocationId: f.locationA2.id }) }),
          ),
          /active accessible location/,
        );
        assert.equal(await f.txA((tx) => tx.customer.count()), 1);
      },
    );
    const order = await f.txA((tx) =>
      tx.order.create({ data: creationOrderData(f, randomUUID(), linkedContact(customer.id)) }),
    );
    await f.txA((tx) =>
      tx.orderItem.create({
        data: {
          organizationId: f.a.organization.id,
          locationId: f.locationA.id,
          orderId: order.id,
          productId: f.catalogA.product.id,
          productName: 'Produs sintetic',
          productSku: 'SYNTHETIC-1',
          position: 0,
          quantity: '1',
          unitPrice: '0',
          lineTotal: '0',
        },
      }),
    );
    await t.test(
      'noua legătură impune tenant/versiune/contact; eșecul nu lasă ordine ori evenimente',
      async () => {
        const foreign = await f.txB((tx) => tx.customer.findFirstOrThrow());
        for (const fields of [
          { ...linkedContact(customer.id), customerVersionSnapshot: null },
          { ...linkedContact(customer.id), customerId: null },
          linkedContact(customer.id, 2),
          linkedContact(foreign.id),
          { ...linkedContact(customer.id), customerNameLookupHash: 'd'.repeat(64) },
          { ...linkedContact(customer.id), customerPhoneLookupHash: 'd'.repeat(64) },
          { ...linkedContact(customer.id), customerDataEncrypted: null },
        ]) {
          const key = randomUUID();
          await assert.rejects(
            f.txA((tx) =>
              tx.order.create({ data: creationOrderData(f, key, { number: 2, ...fields }) }),
            ),
            /matching contact snapshot|order_customer_reference_shape/,
          );
          assert.equal(
            await f.txA((tx) => tx.orderCreationClaim.count({ where: { requestKey: key } })),
            0,
          );
        }
        assert.equal(await f.txA((tx) => tx.order.count()), 1);
        assert.equal(await f.txA((tx) => tx.orderRealtimeEvent.count()), 1);
      },
    );
    await t.test(
      'omitere păstrează; dezlegare și reselecție doar DRAFT; istoria nu se rescrie',
      async () => {
        const preserved = await f.txA((tx) =>
          tx.order.update({
            where: { id: order.id },
            data: { notes: 'Notă sintetică', version: { increment: 1 } },
          }),
        );
        assert.equal(preserved.customerId, customer.id);
        const detached = await f.txA((tx) =>
          tx.order.update({
            where: { id: order.id },
            data: { customerId: null, customerVersionSnapshot: null, version: { increment: 1 } },
          }),
        );
        assert.equal(detached.customerDataEncrypted, order.customerDataEncrypted);
        await f.txA((tx) =>
          tx.order.update({
            where: { id: order.id },
            data: { ...linkedContact(customer.id), version: { increment: 1 } },
          }),
        );
        await f.txA((tx) =>
          tx.order.update({
            where: { id: order.id },
            data: { status: 'CONFIRMED', version: { increment: 1 } },
          }),
        );
        for (const data of [
          { customerId: null, customerVersionSnapshot: null },
          { customerDataEncrypted: 'd'.repeat(80) },
        ])
          await assert.rejects(
            f.txA((tx) =>
              tx.order.update({
                where: { id: order.id },
                data: { ...data, version: { increment: 1 } },
              }),
            ),
            /immutable snapshot/,
          );
        const current = await f.txA((tx) =>
          tx.order.findUniqueOrThrow({ where: { id: order.id } }),
        );
        assert.equal(current.version, 5);
        assert.equal(current.customerId, customer.id);
        assert.equal(await f.txA((tx) => tx.customer.count()), 1);
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
