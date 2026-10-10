import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  createCustomerAddressFixture,
  addressData,
  addressOrderFields,
  archiveAddress,
  retireAddress,
} from './fixtures/customer-address.fixture';
import { creationOrderData } from './fixtures/order-creation.fixture';
test('PostgreSQL real: adresar criptat, claim terminal, izolare și istorie', async (t) => {
  const f = await createCustomerAddressFixture();
  try {
    const address = await f.txA((tx) => tx.customerAddress.create({ data: addressData(f) }));
    await t.test(
      'crearea inserează claim atomic, RLS/ACL nu expun alt tenant și nu permit rescriere',
      async () => {
        const claim = await f.txA((tx) =>
          tx.customerAddressCreationClaim.findFirstOrThrow({ where: { addressId: address.id } }),
        );
        assert.equal(claim.status, 'CREATED');
        assert.equal(claim.requestHash, address.creationRequestHash);
        assert.equal(claim.actorUserId, address.createdByUserId);
        assert.equal(await f.runtime.customerAddress.count(), 0);
        assert.equal(
          await f.txB((tx) => tx.customerAddress.findUnique({ where: { id: address.id } })),
          null,
        );
        assert.equal(await f.txB((tx) => tx.customerAddressCreationClaim.count()), 0);
        await assert.rejects(f.auth.customerAddress.findMany(), /permission denied/);
        await assert.rejects(
          f.platform.customerAddressCreationClaim.findMany(),
          /permission denied/,
        );
        await assert.rejects(
          f.txA((tx) => tx.customerAddress.delete({ where: { id: address.id } })),
          /permission denied/,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.customerAddressCreationClaim.update({
              where: { id: claim.id },
              data: { status: 'RETIRED' },
            }),
          ),
          /permission denied/,
        );
        await assert.rejects(
          f.txA((tx) => tx.customerAddressCreationClaim.delete({ where: { id: claim.id } })),
          /permission denied/,
        );
        const [flags] = await f.runtime.$queryRaw<
          Array<{ forced: boolean; update: boolean }>
        >`SELECT relforcerowsecurity AS forced,has_table_privilege('pos_runtime','"CustomerAddressCreationClaim"','UPDATE') AS update FROM pg_class WHERE oid='"CustomerAddressCreationClaim"'::regclass`;
        assert.deepEqual(flags, { forced: true, update: false });
      },
    );
    await t.test(
      'actor/tenant/content fals, claim întârziat și rollback nu lasă adrese fantomă',
      async () => {
        for (const overrides of [
          { customerId: f.foreign.id },
          { createdByUserId: f.b.user.id },
          { createdLocationId: f.locationB.id },
          { privateDataEncrypted: 'Adresă în clar' },
          { snapshotHash: 'bad' },
        ])
          await assert.rejects(
            f.txA((tx) => tx.customerAddress.create({ data: addressData(f, overrides) })),
            /foreign key|scoped actor|check constraint|active customer/i,
          );
        await assert.rejects(
          f.txA((tx) =>
            tx.customerAddress.update({
              where: { id: address.id },
              data: { privateDataEncrypted: 'b'.repeat(80) },
            }),
          ),
          /atomic immutable command|active customer, active address/,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.customerAddressCreationClaim.create({
              data: {
                organizationId: f.a.organization.id,
                customerId: f.customer.id,
                locationId: f.locationA.id,
                actorUserId: f.a.user.id,
                requestKey: randomUUID(),
                status: 'CREATED',
                addressId: address.id,
                requestHash: address.creationRequestHash,
              },
            }),
          ),
          /exact atomic address identity/,
        );
        const key = randomUUID();
        await assert.rejects(
          f.txA(async (tx) => {
            await tx.customerAddress.create({ data: addressData(f, { creationRequestKey: key }) });
            throw new Error('intentional rollback');
          }),
          /intentional rollback/,
        );
        assert.equal(
          await f.txA((tx) =>
            tx.customerAddressCreationClaim.count({ where: { requestKey: key } }),
          ),
          0,
        );
        assert.equal(
          await f.txA((tx) => tx.customerAddress.count({ where: { creationRequestKey: key } })),
          0,
        );
      },
    );
    await t.test(
      'retragerea blochează orice corp întârziat, dar alt context este independent',
      async () => {
        const key = randomUUID();
        await f.txA((tx) => retireAddress(tx, f, key));
        await assert.rejects(
          f.txA((tx) =>
            tx.customerAddress.create({ data: addressData(f, { creationRequestKey: key }) }),
          ),
          /customer_address_claim_identity|Unique constraint/,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.customerAddress.create({
              data: addressData(f, {
                creationRequestKey: key,
                creationRequestHash: 'a'.repeat(64),
              }),
            }),
          ),
          /customer_address_claim_identity|Unique constraint/,
        );
        const other = await f.txA((tx) =>
          tx.customerAddress.create({
            data: addressData(f, { creationRequestKey: key, createdLocationId: f.locationA2.id }),
          }),
        );
        assert.equal(other.createdLocationId, f.locationA2.id);
      },
    );
    const order = await f.txA((tx) =>
      tx.order.create({
        data: creationOrderData(f, randomUUID(), addressOrderFields(f.customer.id, address.id)),
      }),
    );
    await t.test(
      'ref cere client, versiune, hash și service corecte; erorile nu lasă evenimente',
      async () => {
        for (const fields of [
          { customerAddressVersionSnapshot: null },
          { customerAddressVersionSnapshot: 2 },
          { deliveryAddressHash: 'f'.repeat(64) },
          { customerId: null, customerVersionSnapshot: null },
          { customerId: f.foreign.id },
          { serviceType: 'TAKEAWAY' },
          { deliveryAddressEncrypted: null },
        ]) {
          const key = randomUUID();
          await assert.rejects(
            f.txA((tx) =>
              tx.order.create({
                data: creationOrderData(f, key, {
                  number: 2,
                  ...addressOrderFields(f.customer.id, address.id),
                  ...fields,
                }),
              }),
            ),
            /matching customer|order_delivery_address_shape|matching contact|active customer/,
          );
          assert.equal(
            await f.txA((tx) => tx.orderCreationClaim.count({ where: { requestKey: key } })),
            0,
          );
        }
      },
    );
    await t.test(
      'arhivarea este unică și păstrează snapshoturi; noile selecții arhivate sunt respinse',
      async () => {
        const archived = await f.txA((tx) => archiveAddress(tx, f, address.id));
        assert.equal(archived.version, 2);
        assert.ok(archived.archivedAt);
        assert.equal(archived.privateDataEncrypted, address.privateDataEncrypted);
        await assert.rejects(
          f.txA((tx) => archiveAddress(tx, f, address.id)),
          /atomic immutable command|active customer, active address/,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.customerAddress.update({
              where: { id: address.id },
              data: { status: 'ACTIVE', version: 3 },
            }),
          ),
          /atomic immutable command|active customer, active address/,
        );
        const kept = await f.txA((tx) =>
          tx.order.update({
            where: { id: order.id },
            data: { notes: 'Notă sintetică', version: { increment: 1 } },
          }),
        );
        assert.equal(kept.deliveryAddressEncrypted, order.deliveryAddressEncrypted);
        assert.equal(kept.customerAddressVersionSnapshot, 1);
        await assert.rejects(
          f.txA((tx) =>
            tx.order.create({
              data: creationOrderData(f, randomUUID(), {
                number: 2,
                ...addressOrderFields(f.customer.id, address.id),
              }),
            }),
          ),
          /active matching/,
        );
        await f.txA((tx) =>
          tx.order.update({
            where: { id: order.id },
            data: { status: 'CANCELLED', version: { increment: 1 } },
          }),
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.order.update({
              where: { id: order.id },
              data: {
                deliveryAddressEncrypted: null,
                deliveryAddressHash: null,
                customerAddressId: null,
                customerAddressVersionSnapshot: null,
                version: { increment: 1 },
              },
            }),
          ),
          /immutable snapshot/,
        );
        const claim = await f.txA((tx) =>
          tx.customerAddressCreationClaim.findFirstOrThrow({ where: { addressId: address.id } }),
        );
        assert.equal(claim.status, 'CREATED');
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
