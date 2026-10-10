import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { creationOrderData } from './fixtures/order-creation.fixture';

// Synthetic ciphertext tests the database boundary; API unit tests exercise actual AES-GCM/AAD.
const contact = {
  customerDataEncrypted: Buffer.from(
    'synthetic-authenticated-ciphertext-for-database-constraint',
  ).toString('base64url'),
  customerNameLookupHash: 'a'.repeat(64),
  customerPhoneLookupHash: 'b'.repeat(64),
};
const absent = {
  customerDataEncrypted: null,
  customerNameLookupHash: null,
  customerPhoneLookupHash: null,
};

test('PostgreSQL real: contactul capturat are formă coerentă, RLS și înghețare după ciornă', async (t) => {
  const f = await createOperationsFixture();
  try {
    const { order } = await f.createDraft();
    await t.test(
      'contactul absent rămâne necunoscut și poate fi setat ori eliminat numai în ciornă',
      async () => {
        assert.equal(order.customerDataEncrypted, null);
        assert.equal(order.customerNameLookupHash, null);
        assert.equal(order.customerPhoneLookupHash, null);
        for (const fields of [contact, absent, contact]) {
          const changed = await f.txA((tx) =>
            tx.order.update({
              where: { id: order.id },
              data: { ...fields, version: { increment: 1 } },
            }),
          );
          assert.equal(changed.customerDataEncrypted, fields.customerDataEncrypted);
          assert.equal(changed.customerNameLookupHash, fields.customerNameLookupHash);
          assert.equal(changed.customerPhoneLookupHash, fields.customerPhoneLookupHash);
        }
        const changed = await f.txA((tx) =>
          tx.order.update({
            where: { id: order.id },
            data: { notes: 'Altă notă sintetică', version: { increment: 1 } },
          }),
        );
        assert.equal(changed.customerDataEncrypted, contact.customerDataEncrypted);
        assert.equal(changed.customerNameLookupHash, contact.customerNameLookupHash);
      },
    );
    await t.test(
      'SQL direct respinge textul clar, indexurile fără criptogramă și indexuri nevalide',
      async () => {
        for (const fields of [
          { ...contact, customerDataEncrypted: 'Client sintetic +373000001' },
          { ...contact, customerDataEncrypted: null },
          { ...contact, customerNameLookupHash: null, customerPhoneLookupHash: null },
          { ...contact, customerNameLookupHash: 'not-a-digest' },
          { ...absent, customerPhoneLookupHash: 'b'.repeat(64) },
        ]) {
          await assert.rejects(
            f.txA((tx) =>
              tx.order.update({
                where: { id: order.id },
                data: { ...fields, version: { increment: 1 } },
              }),
            ),
            /order_customer_snapshot_shape/,
          );
        }
        assert.equal(
          (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }))).version,
          5,
        );
      },
    );
    await t.test(
      'RLS ascunde toate câmpurile din alt tenant și refuză legăturile între tenanți',
      async () => {
        assert.equal(await f.runtime.order.findUnique({ where: { id: order.id } }), null);
        assert.equal(await f.txB((tx) => tx.order.findUnique({ where: { id: order.id } })), null);
        const attempts = await f.txB((tx) =>
          tx.order.updateMany({
            where: { id: order.id },
            data: { ...absent, version: { increment: 1 } },
          }),
        );
        assert.equal(attempts.count, 0);
        await assert.rejects(
          f.txA((tx) =>
            tx.order.create({
              data: creationOrderData(f, randomUUID(), {
                number: 2,
                ...contact,
                locationId: f.locationB.id,
              }),
            }),
          ),
        );
        const [role] = await f.runtime.$queryRaw<
          Array<{ superuser: boolean; bypass: boolean; forced: boolean; platform: boolean }>
        >`
        SELECT r.rolsuper AS superuser,r.rolbypassrls AS bypass,c.relforcerowsecurity AS forced,
          has_table_privilege('pos_platform','"Order"','SELECT') AS platform
        FROM pg_roles r CROSS JOIN pg_class c WHERE r.rolname=current_user AND c.oid='"Order"'::regclass`;
        assert.deepEqual(role, { superuser: false, bypass: false, forced: true, platform: false });
      },
    );
    await t.test(
      'confirmarea îngheață fiecare câmp chiar cu versiunea și actorul corecte',
      async () => {
        const confirmed = await f.txA((tx) =>
          tx.order.update({
            where: { id: order.id },
            data: { status: 'CONFIRMED', version: { increment: 1 } },
          }),
        );
        for (const fields of [
          absent,
          { customerDataEncrypted: `${contact.customerDataEncrypted}A` },
          { customerNameLookupHash: 'c'.repeat(64) },
          { customerPhoneLookupHash: 'd'.repeat(64) },
        ]) {
          await assert.rejects(
            f.txA((tx) =>
              tx.order.update({
                where: { id: order.id },
                data: { ...fields, version: { increment: 1 } },
              }),
            ),
            /immutable snapshot mutation/,
          );
        }
        const stored = await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
        assert.equal(stored.version, confirmed.version);
        assert.equal(stored.customerDataEncrypted, contact.customerDataEncrypted);
        assert.equal(stored.customerNameLookupHash, contact.customerNameLookupHash);
        assert.equal(stored.customerPhoneLookupHash, contact.customerPhoneLookupHash);
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
