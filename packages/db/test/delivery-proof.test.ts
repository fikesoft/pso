import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import { createDeliveryProofFixture } from './fixtures/delivery-proof.fixture';
import { writeDelivery } from './fixtures/delivery.fixture';
import { addressRace } from './fixtures/address-race.fixture';
import type { AddressRaceAction } from './fixtures/address-race.types';
test('PostgreSQL: dovada este atomică, proprie, scoped, unică și imuabilă', async () => {
  const f = await createDeliveryProofFixture();
  try {
    await assert.rejects(
      f.txA((tx) => writeDelivery(tx, f.sent.order.id, { toStatus: 'DELIVERED' })),
      /requires atomic proof/,
    );
    assert.equal(
      (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: f.sent.order.id } })))
        .deliveryStatus,
      'DELIVERING',
    );
    await assert.rejects(
      f.txA((tx) => tx.deliveryProof.create({ data: f.proof(f.assignment.id) })),
      /atomic delivery operation/,
    );
    for (const patch of [
      { assignmentId: randomUUID() },
      { actorUserId: f.b.user.id },
      { organizationId: f.b.organization.id },
      { locationId: f.locationA2.id },
      { orderId: randomUUID() },
    ])
      await assert.rejects(
        f.txA(async (tx) => {
          const op = await writeDelivery(tx, f.sent.order.id, { toStatus: 'DELIVERED' });
          await tx.deliveryProof.create({ data: f.proof(op.id, patch) });
        }),
      );
    assert.equal(await f.txA((tx) => tx.deliveryProof.count()), 0);
    await assert.rejects(
      f.txA(async (tx) => {
        await f.deliver(tx);
        throw new Error('rollback proof');
      }),
      /rollback proof/,
    );
    assert.equal(await f.txA((tx) => tx.deliveryProof.count()), 0);
    const stored = await f.txA(async (tx) => {
      const op = await writeDelivery(tx, f.sent.order.id, { toStatus: 'DELIVERED' });
      return tx.deliveryProof.create({ data: f.proof(op.id, { confirmedAt: new Date(0) }) });
    });
    assert.ok(stored.confirmedAt.getTime() > 0);
    assert.equal(
      (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: f.sent.order.id } })))
        .deliveryStatus,
      'DELIVERED',
    );
    assert.equal(await f.txA((tx) => tx.payment.count()), 0);
    await assert.rejects(
      f.txA((tx) => tx.deliveryProof.create({ data: f.proof(stored.operationId) })),
      /atomic delivery operation/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.deliveryProof.update({
          where: { id: stored.id },
          data: { privateDataEncrypted: 'x'.repeat(100) },
        }),
      ),
    );
    await assert.rejects(f.txA((tx) => tx.deliveryProof.delete({ where: { id: stored.id } })));
    assert.equal(await f.runtime.deliveryProof.count(), 0);
    assert.equal(await f.txB((tx) => tx.deliveryProof.count()), 0);
    await assert.rejects(
      f.txB((tx) => tx.deliveryProof.create({ data: f.proof(stored.operationId) })),
    );
  } finally {
    await f.close();
  }
});
test('PostgreSQL: predarea cu dovadă și retragerea au un singur rezultat în RC/RR', async (t) => {
  for (const isolation of ['ReadCommitted', 'RepeatableRead'] as const)
    for (const retiringFirst of [false, true])
      await t.test(`${isolation}, retirement first: ${retiringFirst}`, async () => {
        const f = await createDeliveryProofFixture(),
          requestKey = randomUUID();
        const clients = [
          createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
          createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
        ];
        try {
          const execute: AddressRaceAction = (tx) => f.deliver(tx, requestKey);
          const retire: AddressRaceAction = (tx) =>
            tx.deliveryRequestRetirement.create({
              data: { ...f.scope, orderId: f.sent.order.id, requestKey, toStatus: 'DELIVERED' },
            });
          const results = await addressRace(
            f,
            clients,
            isolation,
            retiringFirst ? [retire, execute] : [execute, retire],
          );
          assert.equal(results[1]!.status, 'rejected');
          assert.equal(await f.txA((tx) => tx.deliveryProof.count()), retiringFirst ? 0 : 1);
          assert.equal(
            (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: f.sent.order.id } })))
              .deliveryStatus,
            retiringFirst ? 'DELIVERING' : 'DELIVERED',
          );
        } finally {
          await Promise.all([...clients.map((client) => client.$disconnect()), f.close()]);
        }
      });
});
