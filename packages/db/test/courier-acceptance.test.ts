import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createCourierAcceptanceFixture } from './fixtures/courier-acceptance.fixture';
import { writeDelivery } from './fixtures/delivery.fixture';
test('PostgreSQL: acceptarea este proprie, imuabilă, unică și nu modifică plata sau starea livrării', async () => {
  const f = await createCourierAcceptanceFixture();
  try {
    const body = f.acceptance();
    await assert.rejects(
      f.txA(async (tx) => {
        await tx.courierAcceptanceCommand.create({ data: body });
        throw new Error('rollback acceptare');
      }),
      /rollback acceptare/,
    );
    assert.equal(await f.txA((tx) => tx.courierAcceptanceCommand.count()), 0);
    await assert.rejects(
      f.txA((tx) => writeDelivery(tx, f.order.id, { toStatus: 'PICKED_UP' })),
      /accept this assignment/,
    );
    for (const patch of [
      { expectedOrderVersion: 1 },
      { assignmentId: randomUUID() },
      { actorUserId: f.b.user.id },
      { courierId: randomUUID() },
      { locationId: f.locationB.id },
    ])
      await assert.rejects(
        f.txA((tx) => tx.courierAcceptanceCommand.create({ data: { ...body, ...patch } })),
      );
    const accepted = await f.txA((tx) =>
      tx.courierAcceptanceCommand.create({
        data: { ...body, acceptedAt: new Date(0), createdAt: new Date(0) },
      }),
    );
    assert.ok(accepted.acceptedAt!.getTime() > 0);
    assert.equal(accepted.acceptedAt!.getTime(), accepted.createdAt.getTime());
    assert.deepEqual(
      await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: f.order.id } })),
      f.order,
    );
    assert.equal(await f.txA((tx) => tx.payment.count()), 0);
    await assert.rejects(
      f.txA((tx) => tx.courierAcceptanceCommand.create({ data: f.acceptance() })),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.courierAcceptanceCommand.update({
          where: { id: accepted.id },
          data: { acceptedAt: new Date(0) },
        }),
      ),
    );
    await assert.rejects(
      f.txA((tx) => tx.courierAcceptanceCommand.delete({ where: { id: accepted.id } })),
    );
    assert.equal(await f.runtime.courierAcceptanceCommand.count(), 0);
    assert.equal(await f.txB((tx) => tx.courierAcceptanceCommand.count()), 0);
    await assert.rejects(
      f.txB((tx) => tx.courierAcceptanceCommand.create({ data: f.acceptance() })),
    );
    // Acceptance removes only its own gate; kitchen readiness remains mandatory.
    await assert.rejects(
      f.txA((tx) => writeDelivery(tx, f.order.id, { toStatus: 'PICKED_UP' })),
      /prepared order/,
    );
  } finally {
    await f.close();
  }
});
test('PostgreSQL: retragerea este terminală, iar o nouă atribuire nu reutilizează acceptarea veche', async () => {
  const f = await createCourierAcceptanceFixture();
  try {
    const body = f.acceptance();
    const retired = await f.txA((tx) =>
      tx.courierAcceptanceCommand.create({ data: { ...body, status: 'RETIRED' } }),
    );
    assert.equal(retired.requestHash, null);
    assert.equal(retired.expectedOrderVersion, null);
    assert.equal(retired.acceptedAt, null);
    await assert.rejects(f.txA((tx) => tx.courierAcceptanceCommand.create({ data: body })));
    await f.txA((tx) => tx.courierAcceptanceCommand.create({ data: f.acceptance() }));
    await f.txA((tx) =>
      writeDelivery(tx, f.order.id, { toStatus: 'FAILED', reason: 'Livrare amânată' }),
    );
    await f.txA((tx) =>
      writeDelivery(tx, f.order.id, { toStatus: 'WAITING_COURIER', reason: 'Reluare confirmată' }),
    );
    await f.txA((tx) =>
      writeDelivery(tx, f.order.id, { toStatus: 'ASSIGNED', courierUserId: f.a.user.id }),
    );
    const current = await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: f.order.id } }));
    await assert.rejects(
      f.txA((tx) =>
        tx.courierAcceptanceCommand.create({
          data: f.acceptance({ expectedOrderVersion: current.version }),
        }),
      ),
    );
    await assert.rejects(
      f.txA((tx) => writeDelivery(tx, f.order.id, { toStatus: 'PICKED_UP' })),
      /accept this assignment/,
    );
  } finally {
    await f.close();
  }
});
