import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { TenantTransaction } from '../src';
import { createKitchenCoursesFixture } from './fixtures/kitchen-courses.fixture';
import { createPackingSessionFixture } from './fixtures/packing-session.fixture';

test('PostgreSQL: sesiune unică și checklist complet, izolat și imuabil pentru toate etapele', async () => {
  const f = await createKitchenCoursesFixture();
  try {
    const sessions = await f.txA((tx) => tx.packingSession.findMany());
    assert.equal(sessions.length, 1);
    const session = sessions[0]!;
    assert.equal(session.orderId, f.ticket.orderId);
    assert.equal(session.ticketId, f.ticket.id);
    assert.equal(session.status, 'WAITING');
    assert.equal(session.version, 1);
    assert.equal(session.createdByUserId, f.a.user.id);
    assert.equal(session.createdAt.toISOString(), f.ticket.createdAt.toISOString());
    assert.equal(session.startedAt, null);
    assert.equal(session.completedAt, null);
    const items = await f.txA((tx) => tx.packingItem.findMany());
    const source = await f.txA((tx) => tx.kitchenTicketItem.findMany());
    assert.equal(items.length, 8);
    assert.deepEqual(
      items.map((item) => item.ticketItemId).sort(),
      source.map((item) => item.id).sort(),
    );
    assert.ok(items.every((item) => !item.checked && item.checkedAt === null));
    assert.equal(await f.runtime.packingSession.count(), 0);
    assert.equal(await f.runtime.packingItem.count(), 0);
    assert.equal(await f.txB((tx) => tx.packingSession.count()), 0);
    assert.equal(await f.txB((tx) => tx.packingItem.count()), 0);
    assert.equal(await f.txA((tx) => tx.packingSession.count()), 1);
    await assert.rejects(f.platform.packingSession.count(), /permission denied/);
    await assert.rejects(f.auth.packingItem.count(), /permission denied/);
    await assert.rejects(
      f.txA((tx) =>
        tx.packingSession.update({
          where: { id: session.id },
          data: { status: 'READY', version: 2 },
        }),
      ),
      /atomic operation/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.packingSession.update({
          where: { id: session.id },
          data: { status: 'CANCELLED', version: 2 },
        }),
      ),
      /atomic operation/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.packingItem.update({ where: { id: items[0]!.id }, data: { checked: true } }),
      ),
      /atomic immutable command/,
    );
    await assert.rejects(
      f.txA((tx) => tx.packingItem.delete({ where: { id: items[0]!.id } })),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) => tx.packingSession.delete({ where: { id: session.id } })),
      /permission denied/,
    );
    await assert.rejects(
      f.txA((tx) => tx.packingSession.create({ data: { ...session, id: randomUUID() } })),
      /atomic initial kitchen generation/,
    );
    await assert.rejects(
      f.txA((tx) => tx.packingItem.create({ data: { ...items[0]!, id: randomUUID() } })),
      /atomic kitchen snapshot/,
    );
    await assert.rejects(
      f.txB((tx) =>
        tx.packingItem.create({
          data: {
            ...items[0]!,
            id: randomUUID(),
            organizationId: f.b.organization.id,
            locationId: f.locationB.id,
          },
        }),
      ),
      /atomic kitchen snapshot/,
    );
    const roles = await f.runtime.$queryRaw<Array<{ relname: string; forced: boolean }>>`
      SELECT relname,relrowsecurity AND relforcerowsecurity AS forced FROM pg_class
      WHERE relname IN ('PackingSession','PackingItem')`;
    assert.equal(roles.length, 2);
    assert.ok(roles.every((row) => row.forced));
    const [worker] = await f.runtime.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT has_table_privilege('pos_worker','"PackingSession"','SELECT') AS allowed`;
    assert.equal(worker!.allowed, false);
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});

test('PostgreSQL: FK compus refuză articolul altei comenzi, iar rollback elimină snapshotul', async () => {
  const f = await createKitchenCoursesFixture(false);
  try {
    const draft = await f.createDraft();
    const existing = await f.txA((tx) => tx.packingItem.findFirstOrThrow());
    async function generate(tx: TenantTransaction) {
      const ticket = await tx.kitchenTicket.create({
        data: {
          organizationId: f.a.organization.id,
          locationId: f.locationA.id,
          orderId: draft.order.id,
          orderVersion: 2,
          requestKey: randomUUID(),
          requestHash: 'a'.repeat(64),
          sentByUserId: f.a.user.id,
        },
      });
      await tx.kitchenTicketItem.create({
        data: {
          organizationId: f.a.organization.id,
          locationId: f.locationA.id,
          ticketId: ticket.id,
          orderItemId: draft.item.id,
          position: 0,
          productName: draft.item.productName,
          productSku: draft.item.productSku,
          quantity: draft.item.quantity,
          note: draft.item.note,
        },
      });
      const session = await tx.packingSession.findFirstOrThrow({
        where: { ticketId: ticket.id },
      });
      assert.equal(await tx.packingItem.count({ where: { sessionId: session.id } }), 1);
      return session;
    }
    await assert.rejects(
      f.txA(async (tx) => {
        const session = await generate(tx);
        await tx.packingItem.create({
          data: {
            organizationId: f.a.organization.id,
            locationId: f.locationA.id,
            sessionId: session.id,
            ticketId: session.ticketId,
            ticketItemId: existing.ticketItemId,
          },
        });
      }),
      /Foreign key constraint/,
    );
    await assert.rejects(
      f.txA(async (tx) => {
        await generate(tx);
        throw new Error('rollback sintetic după generarea checklistului');
      }),
      /rollback sintetic/,
    );
    assert.equal(await f.txA((tx) => tx.packingSession.count()), 1);
    assert.equal(await f.txA((tx) => tx.packingItem.count()), 8);
    assert.equal(await f.txA((tx) => tx.kitchenTicket.count()), 1);
    assert.equal(
      (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: draft.order.id } }))).status,
      'DRAFT',
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});

test('PostgreSQL: anularea închide atomic ambalarea și păstrează checklistul istoric', async () => {
  const f = await createKitchenCoursesFixture(false);
  try {
    const before = await f.txA((tx) => tx.packingItem.findMany({ orderBy: { id: 'asc' } }));
    async function cancel(tx: TenantTransaction) {
      await tx.kitchenTicket.update({
        where: { id: f.ticket.id },
        data: { status: 'CANCELLED', version: 2, updatedByUserId: f.a.user.id },
      });
      await tx.order.update({
        where: { id: f.ticket.orderId },
        data: { status: 'CANCELLED', version: 4, updatedByUserId: f.a.user.id },
      });
      const reservation = await tx.inventoryReservation.findFirstOrThrow();
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED', resolvedAt: new Date() },
      });
      await tx.orderStatusEvent.create({
        data: {
          organizationId: f.a.organization.id,
          locationId: f.locationA.id,
          orderId: f.ticket.orderId,
          kind: 'ORDER',
          fromStatus: 'CONFIRMED',
          toStatus: 'CANCELLED',
          actorUserId: f.a.user.id,
          reason: 'Anulare sintetică pentru verificarea ambalării',
        },
      });
      return tx.packingSession.findFirstOrThrow();
    }
    await assert.rejects(
      f.txA(async (tx) => {
        assert.equal((await cancel(tx)).status, 'CANCELLED');
        throw new Error('rollback anulare');
      }),
      /rollback anulare/,
    );
    assert.equal((await f.txA((tx) => tx.packingSession.findFirstOrThrow())).status, 'WAITING');
    const cancelled = await f.txA(cancel);
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(cancelled.version, 2);
    assert.equal(cancelled.updatedByUserId, f.a.user.id);
    assert.ok(cancelled.cancelledAt! >= cancelled.createdAt);
    assert.deepEqual(
      await f.txA((tx) => tx.packingItem.findMany({ orderBy: { id: 'asc' } })),
      before,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});

test('PostgreSQL: masă, la pachet, ridicare și livrare primesc aceeași verificare inițială', async () => {
  for (const serviceType of ['DINE_IN', 'TAKEAWAY', 'PICKUP', 'DELIVERY'] as const) {
    const f = await createPackingSessionFixture(serviceType);
    try {
      assert.equal(f.session.status, 'WAITING');
      assert.equal(f.session.version, 1);
      assert.equal(f.session.ticketId, f.ticket.id);
      assert.equal(f.items.length, 1);
      assert.equal(f.items[0]!.checked, false);
      assert.equal(
        (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: f.ticket.orderId } })))
          .serviceType,
        serviceType,
      );
    } finally {
      await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
    }
  }
});
