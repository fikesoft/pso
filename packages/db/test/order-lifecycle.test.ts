import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient, withTenantTransaction } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { publishKitchenFixture } from './fixtures/operations-kitchen.fixture';

test('PostgreSQL real: confirmare, preparare și anulare atomică fără rescrierea istoricului', async (t) => {
  const f = await createOperationsFixture();
  try {
    await t.test(
      'confirmarea fixează liniile fără ticket sau rezervare; etapele nu pot fi sărite',
      async () => {
        const draft = await f.createDraft();
        await f.txA((tx) =>
          tx.order.update({
            where: { id: draft.order.id },
            data: { status: 'CONFIRMED', version: { increment: 1 } },
          }),
        );
        assert.equal(
          await f.txA((tx) =>
            tx.inventoryReservation.count({ where: { orderId: draft.order.id } }),
          ),
          0,
        );
        assert.equal(
          await f.txA((tx) => tx.kitchenTicket.count({ where: { orderId: draft.order.id } })),
          0,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.orderItem.update({
              where: { id: draft.item.id },
              data: { quantity: '2', lineTotal: '20.01' },
            }),
          ),
          /only draft/,
        );
        for (const status of ['DRAFT', 'READY', 'COMPLETED', 'OPEN']) {
          await assert.rejects(
            f.txA((tx) =>
              tx.order.update({
                where: { id: draft.order.id },
                data: { status, version: { increment: 1 } },
              }),
            ),
          );
        }
        await assert.rejects(
          f.txA((tx) =>
            tx.order.update({
              where: { id: draft.order.id },
              data: { status: 'IN_PROGRESS', version: { increment: 1 } },
            }),
          ),
          /stage must agree/,
        );
      },
    );
    const draft = await f.createDraft();
    const sent = await publishKitchenFixture(f, draft);
    await t.test(
      'pregătirea parțială schimbă starea operațională în aceeași tranzacție',
      async () => {
        for (const status of ['PREPARING', 'PARTIALLY_READY', 'READY']) {
          await f.txA(async (tx) => {
            await tx.kitchenTicket.update({
              where: { id: sent.ticket.id },
              data: { status, version: { increment: 1 }, updatedByUserId: f.a.user.id },
            });
            await tx.order.update({
              where: { id: draft.order.id },
              data: {
                status: 'IN_PROGRESS',
                kitchenStatus: status,
                version: { increment: 1 },
                updatedByUserId: f.a.user.id,
              },
            });
          });
        }
        assert.equal(
          (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: draft.order.id } })))
            .status,
          'IN_PROGRESS',
        );
        assert.equal(
          (
            await f.txA((tx) =>
              tx.inventoryReservation.findFirstOrThrow({ where: { orderId: draft.order.id } }),
            )
          ).status,
          'PENDING',
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.kitchenTicket.update({
              where: { id: sent.ticket.id },
              data: {
                status: 'PREPARING',
                version: { increment: 1 },
                updatedByUserId: f.a.user.id,
              },
            }),
          ),
        );
      },
    );
    const cancel = (omit: 'reason' | 'release' | 'ticket' | null = null) =>
      f.txA(async (tx) => {
        if (omit !== 'ticket')
          await tx.kitchenTicket.update({
            where: { id: sent.ticket.id },
            data: { status: 'CANCELLED', version: { increment: 1 }, updatedByUserId: f.a.user.id },
          });
        await tx.order.update({
          where: { id: draft.order.id },
          data: { status: 'CANCELLED', version: { increment: 1 }, updatedByUserId: f.a.user.id },
        });
        if (omit !== 'release')
          await tx.inventoryReservation.updateMany({
            where: { orderId: draft.order.id },
            data: { status: 'RELEASED', resolvedAt: new Date() },
          });
        return tx.orderStatusEvent.create({
          data: {
            organizationId: f.a.organization.id,
            locationId: f.locationA.id,
            orderId: draft.order.id,
            kind: 'ORDER',
            fromStatus: 'IN_PROGRESS',
            toStatus: 'CANCELLED',
            actorUserId: f.a.user.id,
            ...(omit !== 'reason' ? { reason: 'Anulare sintetică autorizată' } : {}),
            requestKey: randomUUID(),
            requestHash: 'c'.repeat(64),
          },
        });
      });
    await t.test(
      'anularea cere ticket oprit, rezervare eliberată și motiv atribuit actorului',
      async () => {
        await assert.rejects(cancel('reason'), /atomic actor and reason/);
        await assert.rejects(cancel('release'), /matching inventory reservation/);
        await assert.rejects(cancel('ticket'), /kitchen snapshot must be complete/);
        const event = await cancel();
        assert.equal(
          (
            await f.txA((tx) =>
              tx.inventoryReservation.findFirstOrThrow({ where: { orderId: draft.order.id } }),
            )
          ).status,
          'RELEASED',
        );
        assert.equal(
          await f.txA((tx) => tx.inventoryDocument.count({ where: { orderId: draft.order.id } })),
          0,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.orderStatusEvent.update({ where: { id: event.id }, data: { reason: 'Rescriere' } }),
          ),
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.order.update({
              where: { id: draft.order.id },
              data: { status: 'READY', version: { increment: 1 } },
            }),
          ),
        );
        assert.equal(
          await f.txB((tx) => tx.order.findUnique({ where: { id: draft.order.id } })),
          null,
        );
      },
    );
    await t.test('două conexiuni reale nu pot confirma și anula aceeași versiune', async () => {
      const extra = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1);
      try {
        const fresh = await f.createDraft();
        const context = { organizationId: f.a.organization.id, userId: f.a.user.id };
        const pids = await Promise.all([
          f.txA((tx) => tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`),
          withTenantTransaction(
            extra,
            context,
            (tx) => tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`,
          ),
        ]);
        assert.notEqual(pids[0][0]!.pid, pids[1][0]!.pid);
        const results = await Promise.all([
          f.txA((tx) =>
            tx.order.updateMany({
              where: { id: fresh.order.id, version: 1 },
              data: { status: 'CONFIRMED', version: { increment: 1 } },
            }),
          ),
          withTenantTransaction(extra, context, (tx) =>
            tx.order.updateMany({
              where: { id: fresh.order.id, version: 1 },
              data: { status: 'CANCELLED', version: { increment: 1 } },
            }),
          ),
        ]);
        assert.deepEqual(results.map((result) => result.count).sort(), [0, 1]);
      } finally {
        await extra.$disconnect();
      }
    });
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
