import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient, withTenantTransaction } from '../src';
import type { TenantTransaction } from '../src';
import { consumeOrder } from '../../../apps/api/src/entities/inventory';
import {
  createInventoryFixture,
  inventoryBalance,
  publishInventoryRecipe,
} from './fixtures/inventory.fixture';
import { readyInventoryOrder } from './fixtures/inventory-finalize.fixture';
import { sendInventoryOrder } from './fixtures/inventory-send.fixture';
import { checkoutData } from './fixtures/checkout.fixture';

test('PostgreSQL real: finalizare operațională independentă de încasare', async (t) => {
  const f = await createInventoryFixture();
  const extra = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1);
  try {
    await publishInventoryRecipe(f, [
      {
        inventoryItemId: f.packaging.id,
        purpose: 'PACKAGING',
        quantityPerUnit: '2',
        serviceTypes: ['PICKUP'],
      },
    ]);
    const sent = await sendInventoryOrder(f, { quantity: '2', serviceType: 'PICKUP' });
    const ready = await readyInventoryOrder(f, sent);
    const actor = await f.txA((tx) =>
      tx.companyUser.findUniqueOrThrow({ where: { id: f.a.user.id } }),
    );
    const input = {
      organizationId: f.a.organization.id,
      locationId: ready.locationId,
      orderId: ready.id,
      requestKey: randomUUID(),
      requestHash: 'd'.repeat(64),
      actorUserId: actor.id,
      actorName: actor.displayName,
    };
    const event = {
      organizationId: input.organizationId,
      locationId: input.locationId,
      orderId: ready.id,
      kind: 'ORDER',
      fromStatus: 'READY',
      toStatus: 'COMPLETED',
      actorUserId: actor.id,
      requestKey: input.requestKey,
      requestHash: input.requestHash,
      orderVersion: ready.version + 1,
    };
    const complete = (
      variant: 'no-event' | 'no-stock' | 'actor' | 'version' | 'key' | 'rollback' | null = null,
    ) =>
      f.txA(async (tx) => {
        await tx.order.update({
          where: { id: ready.id },
          data: {
            status: 'COMPLETED',
            version: { increment: 1 },
            updatedByUserId: actor.id,
          },
        });
        if (variant !== 'no-event')
          await tx.orderStatusEvent.create({
            data: {
              ...event,
              ...(variant === 'actor' ? { actorUserId: f.b.user.id } : {}),
              ...(variant === 'version' ? { orderVersion: ready.version } : {}),
            },
          });
        if (variant !== 'no-stock')
          await consumeOrder(tx, {
            ...input,
            ...(variant === 'key' ? { requestKey: randomUUID() } : {}),
          });
        if (variant === 'rollback') throw new Error('Rollback după consum');
      });
    await t.test('evenimentul, actorul, versiunea și consumul trebuie să fie atomice', async () => {
      for (const variant of [
        'no-event',
        'no-stock',
        'actor',
        'version',
        'key',
        'rollback',
      ] as const) {
        await assert.rejects(complete(variant));
        assert.equal(
          (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: ready.id } }))).status,
          'READY',
        );
        assert.equal(await inventoryBalance(f, f.packaging.id), '0.000000');
        assert.equal(
          await f.txA((tx) =>
            tx.orderStatusEvent.count({ where: { requestKey: input.requestKey } }),
          ),
          0,
        );
      }
    });
    await t.test('finalizarea consumă exact rezervarea, fără checkout sau plată', async () => {
      await complete();
      assert.equal(await inventoryBalance(f, f.packaging.id), '-4.000000');
      assert.equal(
        (
          await f.txA((tx) =>
            tx.inventoryReservation.findFirstOrThrow({ where: { orderId: ready.id } }),
          )
        ).status,
        'CONSUMED',
      );
      assert.equal(await f.txA((tx) => tx.checkout.count({ where: { orderId: ready.id } })), 0);
      assert.equal(await f.txA((tx) => tx.payment.count({ where: { orderId: ready.id } })), 0);
      assert.equal(
        await f.txB((tx) => tx.orderStatusEvent.count({ where: { orderId: ready.id } })),
        0,
      );
      await assert.rejects(complete());
      await assert.rejects(
        f.txA((tx) => tx.orderStatusEvent.create({ data: { ...event, requestKey: randomUUID() } })),
        /atomic order version/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.orderStatusEvent.updateMany({
            where: { orderId: ready.id },
            data: { orderVersion: 999 },
          }),
        ),
      );
      assert.equal(
        await f.txA((tx) => tx.inventoryDocument.count({ where: { orderId: ready.id } })),
        1,
      );
    });
    await t.test(
      'checkout și finalizare concurente pe conexiuni distincte au un singur câștigător',
      async () => {
        const fresh = await sendInventoryOrder(f, { quantity: '1', serviceType: 'PICKUP' });
        const order = await readyInventoryOrder(f, fresh);
        const data = await checkoutData(f, order);
        const context = { organizationId: input.organizationId, userId: actor.id };
        const backends = new Set<number>();
        let release!: () => void;
        let abort!: (error: Error) => void;
        const barrier = new Promise<void>((resolve, reject) => {
          release = resolve;
          abort = reject;
        });
        const timeout = setTimeout(
          () => abort(new Error('Ambele tranzacții trebuie să fie active')),
          5000,
        );
        async function enter(tx: TenantTransaction) {
          const [backend] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          backends.add(backend!.pid);
          if (backends.size === 2) release();
          await barrier;
        }
        const outcomes = await Promise.allSettled([
          f.txA(async (tx) => {
            await enter(tx);
            const completed = await tx.order.update({
              where: { id: order.id, version: order.version },
              data: {
                status: 'COMPLETED',
                version: { increment: 1 },
                updatedByUserId: actor.id,
              },
            });
            await tx.orderStatusEvent.create({
              data: {
                ...event,
                orderId: order.id,
                orderVersion: completed.version,
                requestKey: data.requestKey,
              },
            });
            return consumeOrder(tx, { ...input, orderId: order.id, requestKey: data.requestKey });
          }),
          withTenantTransaction(extra, context, async (tx) => {
            await enter(tx);
            await tx.checkout.create({ data });
            await tx.order.update({
              where: { id: order.id },
              data: {
                status: 'COMPLETED',
                version: { increment: 1 },
                updatedByUserId: actor.id,
              },
            });
            return consumeOrder(tx, {
              ...input,
              orderId: order.id,
              requestKey: data.requestKey,
              requestHash: data.requestHash,
            });
          }),
        ]);
        clearTimeout(timeout);
        assert.equal(backends.size, 2);
        assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(
          await f.txA((tx) => tx.inventoryDocument.count({ where: { orderId: order.id } })),
          1,
        );
        assert.equal(await inventoryBalance(f, f.packaging.id), '-6.000000');
      },
    );
  } finally {
    await Promise.all([
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
      extra.$disconnect(),
    ]);
  }
});
