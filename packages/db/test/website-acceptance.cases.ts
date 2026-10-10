import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { WebsiteFixture } from './fixtures/website.types';

export async function runWebsiteAcceptanceTests(t: TestContext, state: WebsiteFixture) {
  const { txA, a, createInbound, acceptInbound } = state;
  await t.test(
    'acceptarea creează DRAFT cu snapshoturi și actor real; apoi permite editare POS',
    async () => {
      const inbox = await createInbound();
      const order = await acceptInbound(inbox.id);
      assert.equal(order.status, 'DRAFT');
      assert.equal(order.serviceType, 'DELIVERY');
      assert.equal(order.createdByUserId, a.user.id);
      assert.equal(order.notes, null);
      const stored = await txA((tx) =>
        tx.websiteOrder.findUniqueOrThrow({ where: { id: inbox.id } }),
      );
      assert.equal(stored.status, 'ACCEPTED');
      assert.equal(stored.version, 2);
      assert.equal(stored.orderId, order.id);
      await txA(async (tx) => {
        const line = await tx.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
        await tx.orderItem.update({
          where: { id: line.id },
          data: { quantity: '2.000', lineTotal: '20.01' },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { total: '20.01', version: { increment: 1 } },
        });
      });
      assert.equal(
        (
          await txA((tx) => tx.websiteOrder.findUniqueOrThrow({ where: { id: inbox.id } }))
        ).total.toFixed(2),
        '10.01',
      );
      await assert.rejects(acceptInbound(inbox.id));
    },
  );
  await t.test(
    'acceptarea cu serviciu, context, actor sau snapshot nepotrivit se anulează complet',
    async () => {
      const inbox = await createInbound();
      const before = await txA((tx) => tx.order.count());
      for (const change of [
        { serviceType: 'TAKEAWAY' },
        { notes: 'Contactul nu intră în bucătărie' },
        { createdByUserId: state.b.user.id },
        { locationId: state.locationA2.id },
      ])
        await assert.rejects(acceptInbound(inbox.id, change));
      await assert.rejects(acceptInbound(inbox.id, {}, { productName: 'Snapshot substituit' }));
      assert.equal(await txA((tx) => tx.order.count()), before);
      assert.equal(
        (await txA((tx) => tx.websiteOrder.findUniqueOrThrow({ where: { id: inbox.id } }))).status,
        'PENDING',
      );
      const oldDraft = await state.createDraft();
      await assert.rejects(
        txA((tx) =>
          tx.websiteOrder.update({
            where: { id: inbox.id },
            data: {
              status: 'ACCEPTED',
              version: { increment: 1 },
              orderId: oldDraft.order.id,
              decisionByUserId: a.user.id,
              decidedAt: new Date(),
            },
          }),
        ),
      );
    },
  );
  await t.test('refuzul este terminal și nu resigilează inboxul pentru linii noi', async () => {
    const inbox = await createInbound();
    const line = await txA((tx) =>
      tx.websiteOrderItem.findFirstOrThrow({ where: { websiteOrderId: inbox.id } }),
    );
    await assert.rejects(
      txA((tx) =>
        tx.websiteOrder.update({
          where: { id: inbox.id },
          data: {
            status: 'REJECTED',
            version: { increment: 1 },
            decisionByUserId: a.user.id,
            decidedAt: new Date(),
          },
        }),
      ),
    );
    await assert.rejects(
      txA(async (tx) => {
        await tx.websiteOrder.update({
          where: { id: inbox.id },
          data: {
            status: 'REJECTED',
            version: { increment: 1 },
            decisionByUserId: a.user.id,
            decidedAt: new Date(),
            rejectionReason: 'Stoc indisponibil',
          },
        });
        await tx.websiteOrderItem.create({ data: { ...line, id: randomUUID(), position: 1 } });
      }),
    );
    await txA((tx) =>
      tx.websiteOrder.update({
        where: { id: inbox.id },
        data: {
          status: 'REJECTED',
          version: { increment: 1 },
          decisionByUserId: a.user.id,
          decidedAt: new Date(),
          rejectionReason: 'Stoc indisponibil',
        },
      }),
    );
    await assert.rejects(acceptInbound(inbox.id));
    await assert.rejects(
      txA((tx) =>
        tx.websiteOrder.update({
          where: { id: inbox.id },
          data: {
            status: 'PENDING',
            version: { increment: 1 },
            decisionByUserId: null,
            decidedAt: null,
            rejectionReason: null,
          },
        }),
      ),
    );
  });
}
