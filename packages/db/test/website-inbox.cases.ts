import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { createDatabaseClient, withTenantTransaction } from '../src/index';
import type { WebsiteFixture } from './fixtures/website.types';

export async function runWebsiteInboxTests(t: TestContext, state: WebsiteFixture) {
  const { txA, a, createInbound } = state;
  await t.test(
    'inboxul păstrează snapshotul și nu creează comandă, ticket sau consum',
    async () => {
      const inbox = await createInbound();
      assert.equal(inbox.status, 'PENDING');
      assert.equal(inbox.orderId, null);
      assert.equal(inbox.total.toFixed(2), '10.01');
      assert.equal(inbox.createdWithKeyId, state.keyA.id);
      assert.equal(await txA((tx) => tx.order.count()), 0);
      assert.equal(await txA((tx) => tx.kitchenTicket.count()), 0);
      assert.equal(await txA((tx) => tx.inventoryMovement.count()), 0);
      assert.deepEqual(await state.runtime.websiteOrder.findMany(), []);
      assert.deepEqual(await state.runtime.websiteOrderItem.findMany(), []);
      assert.equal(
        await state.txB((tx) => tx.websiteOrder.findUnique({ where: { id: inbox.id } })),
        null,
      );
    },
  );
  await t.test(
    'prețul fals, produsul străin, totalul fals și inboxul gol sunt respinse atomic',
    async () => {
      const before = await txA((tx) => tx.websiteOrder.count());
      for (const options of [
        { header: { total: '10.02' } },
        { header: { serviceType: 'TAKEAWAY' } },
        { header: { createdWithKeyId: state.keyB.id } },
        { header: { locationId: state.locationA2.id } },
        { item: { unitPrice: '9.0000', lineTotal: '9.00' }, header: { total: '9.00' } },
        { item: { productId: state.catalogB.product.id } },
        { item: { productName: 'Snapshot falsificat' } },
        { item: { quantity: '0.000' } },
        { item: { lineTotal: 'NaN' } },
        { omitItems: true },
      ])
        await assert.rejects(createInbound(options));
      assert.equal(await txA((tx) => tx.websiteOrder.count()), before);
    },
  );
  await t.test('snapshoturile sunt imuabile, iar liniile nu pot fi adăugate tardiv', async () => {
    const inbox = await createInbound();
    const line = await txA((tx) =>
      tx.websiteOrderItem.findFirstOrThrow({ where: { websiteOrderId: inbox.id } }),
    );
    await assert.rejects(
      txA((tx) =>
        tx.websiteOrder.update({
          where: { id: inbox.id },
          data: { customerDataEncrypted: 'different-encrypted-payload', version: { increment: 1 } },
        }),
      ),
    );
    await assert.rejects(
      txA((tx) =>
        tx.websiteOrderItem.update({ where: { id: line.id }, data: { note: 'Alterat' } }),
      ),
    );
    await assert.rejects(
      txA((tx) => tx.websiteOrderItem.create({ data: { ...line, id: randomUUID(), position: 1 } })),
    );
    await assert.rejects(txA((tx) => tx.websiteOrderItem.delete({ where: { id: line.id } })));
    await assert.rejects(txA((tx) => tx.websiteOrder.delete({ where: { id: inbox.id } })));
  });
  await t.test(
    'requestKey și externalOrderId sunt fiecare unice în aceeași conexiune',
    async () => {
      const inbox = await createInbound();
      await assert.rejects(createInbound({ header: { requestKey: inbox.requestKey } }), {
        code: 'P2002',
      });
      await assert.rejects(createInbound({ header: { externalOrderId: inbox.externalOrderId } }), {
        code: 'P2002',
      });
      const connection = await txA((tx) =>
        tx.websiteConnection.create({
          data: {
            organizationId: a.organization.id,
            locationId: state.locationA.id,
            name: 'Alt website sintetic',
            createdByUserId: a.user.id,
          },
        }),
      );
      const key = await state.createKey('a', { connectionId: connection.id });
      const other = await createInbound({
        header: {
          connectionId: connection.id,
          createdWithKeyId: key.id,
          requestKey: inbox.requestKey,
          externalOrderId: inbox.externalOrderId,
        },
      });
      assert.notEqual(other.id, inbox.id);
    },
  );
  await t.test('două recepții concurente produc un singur inbox complet', async () => {
    const client = createDatabaseClient(process.env.TEST_DATABASE_URL!, 2);
    const externalOrderId = randomUUID();
    const requestKey = randomUUID();
    try {
      const attempts = await Promise.allSettled(
        [0, 1].map(() =>
          withTenantTransaction(client, { organizationId: a.organization.id }, (tx) =>
            state.writeInbound(tx, { header: { externalOrderId, requestKey } }),
          ),
        ),
      );
      assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(attempts.filter((result) => result.status === 'rejected').length, 1);
      const saved = await txA((tx) => tx.websiteOrder.findMany({ where: { externalOrderId } }));
      assert.equal(saved.length, 1);
      assert.equal(
        await txA((tx) => tx.websiteOrderItem.count({ where: { websiteOrderId: saved[0]!.id } })),
        1,
      );
    } finally {
      await client.$disconnect();
    }
  });
}
