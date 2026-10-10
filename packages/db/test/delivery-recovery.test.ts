import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import { createCourierAcceptanceFixture } from './fixtures/courier-acceptance.fixture';
import { addressRace } from './fixtures/address-race.fixture';
import type { AddressRaceAction } from './fixtures/address-race.types';
import { writeDelivery } from './fixtures/delivery.fixture';
test('PostgreSQL: livrarea retrasă nu poate fi executată, registrul este scoped și imuabil', async () => {
  const f = await createCourierAcceptanceFixture();
  try {
    const body = {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      orderId: f.order.id,
      actorUserId: f.a.user.id,
      requestKey: randomUUID(),
      toStatus: 'FAILED',
    };
    const retired = await f.txA((tx) =>
      tx.deliveryRequestRetirement.create({ data: { ...body, createdAt: new Date(0) } }),
    );
    await assert.rejects(
      f.runtime.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true)`;
        await tx.deliveryRequestRetirement.create({ data: { ...body, requestKey: randomUUID() } });
      }),
      /active scoped actor/,
    );
    assert.ok(retired.createdAt.getTime() > 0);
    await assert.rejects(
      f.txA((tx) =>
        writeDelivery(tx, f.order.id, {
          toStatus: 'FAILED',
          reason: 'Refuz sintetic',
          operation: { requestKey: body.requestKey },
        }),
      ),
      /permanently retired/,
    );
    assert.equal(
      (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: f.order.id } })))
        .deliveryStatus,
      'ASSIGNED',
    );
    await assert.rejects(
      f.txA((tx) => tx.deliveryRequestRetirement.delete({ where: { id: retired.id } })),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.deliveryRequestRetirement.update({
          where: { id: retired.id },
          data: { toStatus: 'DELIVERED' },
        }),
      ),
    );
    await assert.rejects(
      f.txA((tx) => tx.deliveryRequestGate.updateMany({ data: { requestKey: randomUUID() } })),
    );
    assert.equal(await f.runtime.deliveryRequestRetirement.count(), 0);
    assert.equal(await f.txB((tx) => tx.deliveryRequestRetirement.count()), 0);
    await assert.rejects(
      f.txB((tx) =>
        tx.deliveryRequestRetirement.create({ data: { ...body, requestKey: randomUUID() } }),
      ),
    );
    for (const patch of [
      { actorUserId: f.b.user.id },
      { locationId: f.locationB.id },
      { orderId: randomUUID() },
    ])
      await assert.rejects(
        f.txA((tx) =>
          tx.deliveryRequestRetirement.create({
            data: { ...body, requestKey: randomUUID(), ...patch },
          }),
        ),
      );
    const op = await f.txA((tx) =>
      writeDelivery(tx, f.order.id, { toStatus: 'FAILED', reason: 'Refuz sintetic' }),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.deliveryRequestRetirement.create({ data: { ...body, requestKey: op.requestKey } }),
      ),
      /unexecuted delivery request/,
    );
  } finally {
    await f.close();
  }
});
test('PostgreSQL: execuția livrării și retragerea concurează fără succes dublu inclusiv în RR', async (t) => {
  for (const isolation of ['ReadCommitted', 'RepeatableRead'] as const)
    for (const retiringFirst of [true, false]) {
      await t.test(`${isolation}, retirement first: ${retiringFirst}`, async () => {
        const f = await createCourierAcceptanceFixture(),
          requestKey = randomUUID();
        const clients = [
          createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
          createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
        ];
        try {
          const execute: AddressRaceAction = (tx) =>
            writeDelivery(tx, f.order.id, {
              toStatus: 'FAILED',
              reason: 'Livrare nereușită',
              operation: { requestKey },
            });
          const retire: AddressRaceAction = (tx) =>
            tx.deliveryRequestRetirement.create({
              data: {
                organizationId: f.a.organization.id,
                locationId: f.locationA.id,
                orderId: f.order.id,
                actorUserId: f.a.user.id,
                requestKey,
                toStatus: 'FAILED',
              },
            });
          const results = await addressRace(
            f,
            clients,
            isolation,
            retiringFirst ? [retire, execute] : [execute, retire],
          );
          assert.equal(results[1]!.status, 'rejected');
          assert.equal(
            await f.txA((tx) => tx.deliveryRequestRetirement.count()),
            retiringFirst ? 1 : 0,
          );
          assert.equal(
            (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: f.order.id } })))
              .deliveryStatus,
            retiringFirst ? 'ASSIGNED' : 'FAILED',
          );
        } finally {
          await Promise.all([...clients.map((client) => client.$disconnect()), f.close()]);
        }
      });
    }
});
