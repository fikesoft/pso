import { cashConflict } from './fixtures/cash-conflict.fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import type { TenantTransaction } from '../src';
import { consumeOrder } from '../../../apps/api/src/entities/inventory';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { checkoutData, prepareCheckoutOrder } from './fixtures/checkout.fixture';

test('PostgreSQL real: DEMO nou versus retragere MANUAL în namespace CHECKOUT', async (t) => {
  const f = await createOperationsFixture();
  const client = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1);
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const)
      for (const demoFirst of [true, false])
        await t.test(
          `${isolationLevel}: ${demoFirst ? 'DEMO → RETIRED' : 'RETIRED → DEMO'}`,
          async () => {
            const order = await prepareCheckoutOrder(f);
            const data = await checkoutData(f, order);
            const retirement = {
              organizationId: f.a.organization.id,
              locationId: order.locationId,
              family: 'CHECKOUT',
              kind: 'CHECKOUT_MANUAL',
              requestKey: data.requestKey,
              orderId: order.id,
              actorUserId: f.a.user.id,
              status: 'RETIRED',
            };
            const retire = async (tx: TenantTransaction) => {
              await tx.cashCommandClaim.create({ data: retirement });
            };
            const demo = async (tx: TenantTransaction) => {
              await tx.checkout.create({ data });
              await tx.order.update({
                where: { id: order.id },
                data: { status: 'COMPLETED', version: { increment: 1 } },
              });
              await consumeOrder(tx, {
                organizationId: data.organizationId,
                locationId: data.locationId,
                orderId: order.id,
                requestKey: data.requestKey,
                requestHash: data.requestHash,
                actorUserId: data.createdByUserId,
                actorName: data.cashierName,
              });
            };
            let ready!: () => void, release!: () => void;
            const snapshot = new Promise<void>((resolve) => {
              ready = resolve;
            });
            const commit = new Promise<void>((resolve) => {
              release = resolve;
            });
            const loser = client.$transaction(
              async (tx) => {
                await tx.$queryRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true),set_config('app.user_id',${f.a.user.id},true)`;
                assert.equal(
                  await tx.cashCommandClaim.count({ where: { requestKey: data.requestKey } }),
                  0,
                );
                ready();
                await commit;
                if (demoFirst) await retire(tx);
                else await demo(tx);
              },
              { isolationLevel, timeout: 15000 },
            );
            const outcome = Promise.allSettled([loser]);
            await snapshot;
            try {
              await f.txA(demoFirst ? demo : retire);
            } finally {
              release();
            }
            const [result] = await outcome;
            assert.equal(result!.status, 'rejected');
            if (result!.status === 'rejected')
              assert.ok(
                cashConflict(
                  result!.reason,
                  /cannot retire an existing command|Unique constraint/i,
                ),
              );
            const state = await f.txA(async (tx) => ({
              claims: await tx.cashCommandClaim.findMany({
                where: { requestKey: data.requestKey },
              }),
              checkouts: await tx.checkout.count({ where: { orderId: order.id } }),
              activities: await tx.cashShiftActivity.count({ where: { orderId: order.id } }),
              movements: await tx.cashMovement.count({ where: { orderId: order.id } }),
            }));
            assert.equal(state.claims.length, 1);
            assert.equal(state.claims[0]!.kind, demoFirst ? 'CHECKOUT_DEMO' : 'CHECKOUT_MANUAL');
            assert.equal(state.checkouts, demoFirst ? 1 : 0);
            assert.equal(state.activities, 0);
            assert.equal(state.movements, 0);
            await f.txA((tx) =>
              tx.cashCommandClaim.create({
                data: { ...retirement, family: 'PAYMENT', kind: 'COLLECT' },
              }),
            );
            assert.equal(
              await f.txA((tx) =>
                tx.cashCommandClaim.count({ where: { requestKey: data.requestKey } }),
              ),
              2,
            );
            const claim = state.claims[0]!;
            await assert.rejects(
              f.txA((tx) =>
                tx.cashCommandClaim.create({
                  data: {
                    ...claim,
                    id: randomUUID(),
                    requestKey: demoFirst ? randomUUID() : claim.requestKey,
                  },
                }),
              ),
              demoFirst ? /exact new source identity/ : /Unique constraint|existing command/,
            );
          },
        );
  } finally {
    await Promise.all([
      client.$disconnect(),
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
    ]);
  }
});
