import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readTimeline } from '../../../apps/api/src/features/orders/model/read-timeline';
import { createOperationsFixture } from './fixtures/operations.fixture';
import {
  createTimelineOrder,
  writeSameTimestampTimeline,
  writeTimelineDraft,
} from './fixtures/timeline.fixture';

test('PostgreSQL real: cronologie atomică, snapshoturi autentice și paginare stabilă', async (t) => {
  const f = await createOperationsFixture();
  try {
    const { order, event } = await createTimelineOrder(f);
    const scope = {
      organizationId: order.organizationId,
      locationId: order.locationId,
      orderId: order.id,
    };
    const read = (cursor?: string) => f.txA((tx) => readTimeline(tx, scope, cursor));
    await t.test(
      'snapshoturile ignoră numele/timpul falsificat și supraviețuiesc redenumirii',
      async () => {
        const actor = await f.txA((tx) =>
          tx.companyUser.findUniqueOrThrow({ where: { id: f.a.user.id } }),
        );
        assert.equal(event.actorDisplayName, actor.displayName);
        assert.equal(event.orderVersion, 1);
        assert.ok(event.createdAt.getFullYear() > 2000);
        await f.txA((tx) =>
          tx.companyUser.update({
            where: { id: actor.id },
            data: { displayName: 'Nume nou sintetic' },
          }),
        );
        const page = await read();
        assert.equal(page.events[0]?.actorDisplayName, actor.displayName);
        assert.equal(page.events[0]?.actorNameSource, 'SNAPSHOT');
        assert.equal(page.events[0]?.action, 'ORDER_CREATED');
        assert.equal(page.events[0]?.terminalId, null);
        const audit = await f.txA((tx) => writeTimelineDraft(tx, order.id));
        assert.equal(audit.actorDisplayName, 'Nume nou sintetic');
        assert.equal(audit.orderVersion, 2);
        assert.deepEqual(audit.metadata, { previousVersion: 1, orderVersion: 2 });
        assert.ok(audit.createdAt.getFullYear() > 2000);
        assert.equal((await read()).events[0]?.action, 'DRAFT_UPDATED');
      },
    );
    await t.test(
      'evenimente tardive, versiuni/stări/actori inventați și duplicate sunt respinse',
      async () => {
        const otherActor = await f.txA((tx) =>
          tx.companyUser.create({
            data: {
              organizationId: order.organizationId,
              loginNormalized: randomUUID(),
              displayName: 'Alt actor',
              passwordHash: 'unused',
              createdByUserId: f.a.user.id,
              managedByUserId: f.a.user.id,
            },
          }),
        );
        const data = {
          organizationId: order.organizationId,
          locationId: order.locationId,
          orderId: order.id,
          kind: 'ORDER',
          fromStatus: 'DRAFT',
          toStatus: 'DRAFT',
          actorUserId: f.a.user.id,
        };
        await assert.rejects(
          f.txA((tx) => tx.orderStatusEvent.create({ data })),
          /atomic state and actor/,
        );
        for (const patch of [
          { toStatus: 'READY' },
          { actorUserId: otherActor.id },
          { orderVersion: 99 },
          { fromStatus: null },
        ]) {
          await assert.rejects(
            f.txA(async (tx) => {
              await tx.order.update({
                where: { id: order.id },
                data: { version: { increment: 1 } },
              });
              await tx.orderStatusEvent.create({ data: { ...data, ...patch } });
            }),
          );
        }
        await assert.rejects(
          f.txA(async (tx) => {
            await tx.order.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
            await tx.orderStatusEvent.create({ data });
            await tx.orderStatusEvent.create({ data });
          }),
        );
        assert.equal(
          (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }))).version,
          2,
        );
        assert.equal((await read()).events.length, 2);
      },
    );
    await t.test(
      'RLS și ACL păstrează evenimentele și auditul în tenant, fără rescriere',
      async () => {
        assert.equal(await f.runtime.orderStatusEvent.count(), 0);
        assert.equal(await f.runtime.auditEvent.count(), 0);
        assert.equal(
          await f.txB((tx) => tx.orderStatusEvent.count({ where: { orderId: order.id } })),
          0,
        );
        assert.equal(
          await f.txB((tx) => tx.auditEvent.count({ where: { targetId: order.id } })),
          0,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.orderStatusEvent.update({
              where: { id: event.id },
              data: { actorDisplayName: 'Rescris' },
            }),
          ),
        );
        await assert.rejects(
          f.txA((tx) => tx.orderStatusEvent.delete({ where: { id: event.id } })),
        );
        const audit = await f.txA((tx) =>
          tx.auditEvent.findFirstOrThrow({ where: { targetId: order.id } }),
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.auditEvent.update({
              where: { id: audit.id },
              data: { actorDisplayName: 'Rescris' },
            }),
          ),
        );
        await assert.rejects(f.txA((tx) => tx.auditEvent.delete({ where: { id: audit.id } })));
        await assert.rejects(
          f.txA((tx) =>
            tx.auditEvent.create({ data: { ...audit, id: randomUUID(), metadata: {} } }),
          ),
          /atomic scoped order and actor/,
        );
        await assert.rejects(
          f.txB((tx) => tx.orderStatusEvent.create({ data: { ...event, id: randomUUID() } })),
        );
      },
    );
    await t.test(
      'surse cu timestamp identic nu se pierd sau dublează la paginare/concurență',
      async () => {
        const fresh = await createTimelineOrder(f);
        const freshScope = { ...scope, orderId: fresh.order.id };
        await f.txA((tx) => writeSameTimestampTimeline(tx, fresh.order.id));
        const first = await f.txA((tx) => readTimeline(tx, freshScope));
        assert.equal(first.events.length, 50);
        assert.ok(first.nextCursor);
        assert.equal(new Set(first.events.map((entry) => entry.createdAt)).size, 1);
        await f.txA((tx) => writeTimelineDraft(tx, fresh.order.id));
        const second = await f.txA((tx) => readTimeline(tx, freshScope, first.nextCursor!));
        const all = [...first.events, ...second.events];
        assert.equal(all.length, 53);
        assert.equal(new Set(all.map((entry) => entry.id)).size, 53);
        assert.equal(second.nextCursor, null);
        assert.equal(all.filter((entry) => entry.action === 'DRAFT_UPDATED').length, 26);
        assert.equal(all.at(-1)?.action, 'ORDER_CREATED');
        await assert.rejects(read(first.nextCursor!), /valid pentru cronologia/);
        const nonexistent = Buffer.from(
          JSON.stringify({ orderId: fresh.order.id, source: 'event', id: randomUUID() }),
        ).toString('base64url');
        await assert.rejects(
          f.txA((tx) => readTimeline(tx, freshScope, nonexistent)),
          /nu aparține/,
        );
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
