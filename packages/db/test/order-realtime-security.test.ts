import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';

test('PostgreSQL real: registrul realtime refuză falsificarea și rămâne izolat și imuabil', async (t) => {
  const f = await createOperationsFixture();
  try {
    const { order } = await f.createDraft();
    const event = await f.txA((tx) =>
      tx.orderRealtimeEvent.findFirstOrThrow({ where: { orderId: order.id } }),
    );
    await t.test(
      'SQL runtime nu poate inventa evenimente actuale, istorice sau pentru alte locații',
      async () => {
        for (const change of [
          {},
          { orderVersion: 2 },
          { amountSnapshot: '99' },
          { locationId: f.locationA2.id },
          { organizationId: f.b.organization.id, locationId: f.locationB.id },
          { type: 'order.ready' },
          { orderId: randomUUID() },
        ]) {
          await assert.rejects(
            f.txA((tx) =>
              tx.orderRealtimeEvent.create({ data: { ...event, id: randomUUID(), ...change } }),
            ),
            /automatic atomic order version|row-level security/,
          );
        }
        // Even a valid same-transaction order update cannot be followed by a caller-written event.
        await assert.rejects(
          f.txA(async (tx) => {
            await tx.order.update({
              where: { id: order.id },
              data: { notes: 'Rollback', version: { increment: 1 } },
            });
            await tx.orderRealtimeEvent.create({
              data: { ...event, id: randomUUID(), orderVersion: 2, type: 'order.updated' },
            });
          }),
          /automatic atomic order version/,
        );
        assert.equal(
          (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }))).version,
          1,
        );
        assert.equal(await f.txA((tx) => tx.orderRealtimeEvent.count()), 1);
      },
    );
    await t.test(
      'nu permite rescrierea sau ștergerea dovezii și protejează tenantul în pool',
      async () => {
        await assert.rejects(
          f.txA((tx) =>
            tx.orderRealtimeEvent.update({
              where: { id: event.id },
              data: { type: 'order.cancelled' },
            }),
          ),
        );
        await assert.rejects(
          f.txA((tx) => tx.orderRealtimeEvent.delete({ where: { id: event.id } })),
        );
        assert.equal(await f.runtime.orderRealtimeEvent.count(), 0);
        assert.equal(await f.txB((tx) => tx.orderRealtimeEvent.count()), 0);
        assert.equal(await f.txA((tx) => tx.orderRealtimeEvent.count()), 1);
        assert.equal(await f.runtime.orderRealtimeEvent.count(), 0);
        await assert.rejects(
          f.runtime.orderRealtimeEvent.create({ data: { ...event, id: randomUUID() } }),
        );
        const [acl] = await f.runtime.$queryRaw<
          Array<{
            forced: boolean;
            update: boolean;
            delete: boolean;
            platform: boolean;
            worker: boolean;
          }>
        >`
        SELECT relforcerowsecurity AS forced,
          has_table_privilege(current_user,'"OrderRealtimeEvent"','UPDATE') AS update,
          has_table_privilege(current_user,'"OrderRealtimeEvent"','DELETE') AS delete,
          has_table_privilege('pos_platform','"OrderRealtimeEvent"','SELECT') AS platform,
          has_table_privilege('pos_worker','"OrderRealtimeEvent"','SELECT') AS worker
        FROM pg_class WHERE oid='"OrderRealtimeEvent"'::regclass`;
        assert.deepEqual(acl, {
          forced: true,
          update: false,
          delete: false,
          platform: false,
          worker: false,
        });
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
