import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { writeDelivery } from './fixtures/delivery.fixture';

test('PostgreSQL real: izolarea livrării, curierului și cheii de idempotență', async (t) => {
  const f = await createOperationsFixture();
  try {
    const createOrder = async () => {
      const draft = await f.createDraft();
      return f.txA((tx) =>
        tx.order.update({
          where: { id: draft.order.id },
          data: { serviceType: 'DELIVERY', status: 'CONFIRMED', version: { increment: 1 } },
        }),
      );
    };
    const order = await createOrder();
    const courier = await f.txA((tx) =>
      tx.companyUser.create({
        data: {
          organizationId: f.a.organization.id,
          loginNormalized: `courier-${randomUUID()}`,
          displayName: 'Curier sintetic',
          passwordHash: 'unused',
          createdByUserId: f.a.user.id,
          managedByUserId: f.a.user.id,
        },
      }),
    );
    const assign = { toStatus: 'ASSIGNED', courierUserId: courier.id };
    await t.test('atribuirea cere un curier activ în locația comenzii', async () => {
      await f.txA((tx) =>
        tx.userLocationAccess.create({
          data: {
            organizationId: f.a.organization.id,
            userId: courier.id,
            locationId: f.locationA2.id,
          },
        }),
      );
      await assert.rejects(
        f.txA((tx) => writeDelivery(tx, order.id, assign)),
        /active distinct courier/,
      );
      await f.txA((tx) =>
        tx.userLocationAccess.create({
          data: {
            organizationId: f.a.organization.id,
            userId: courier.id,
            locationId: f.locationA.id,
          },
        }),
      );
      await f.txA((tx) =>
        tx.companyUser.update({ where: { id: courier.id }, data: { status: 'DISABLED' } }),
      );
      await assert.rejects(
        f.txA((tx) => writeDelivery(tx, order.id, assign)),
        /active distinct courier/,
      );
      await f.txA((tx) =>
        tx.companyUser.update({ where: { id: courier.id }, data: { status: 'ACTIVE' } }),
      );
    });
    await t.test('operația nu poate falsifica tenantul, locația sau actorul', async () => {
      for (const operation of [
        { organizationId: f.b.organization.id },
        { locationId: f.locationA2.id },
        { locationId: f.locationB.id },
        { actorUserId: f.b.user.id },
      ])
        await assert.rejects(f.txA((tx) => writeDelivery(tx, order.id, { ...assign, operation })));
      assert.equal(
        await f.txA((tx) => tx.deliveryOperation.count({ where: { orderId: order.id } })),
        0,
      );
      assert.equal(
        (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }))).version,
        order.version,
      );
    });
    const requestKey = randomUUID();
    const assigned = await f.txA((tx) =>
      writeDelivery(tx, order.id, { ...assign, operation: { requestKey } }),
    );
    await t.test('istoricul păstrează numele original după redenumirea curierului', async () => {
      await f.txA((tx) =>
        tx.companyUser.update({
          where: { id: courier.id },
          data: { displayName: 'Nume schimbat' },
        }),
      );
      const failed = await f.txA((tx) =>
        writeDelivery(tx, order.id, { toStatus: 'FAILED', reason: 'Client indisponibil' }),
      );
      assert.equal(failed.courierName, 'Curier sintetic');
      assert.equal(assigned.courierName, 'Curier sintetic');
      assert.equal(failed.previousCourierId, courier.id);
    });
    await t.test('cheia nu poate fi reutilizată pe altă comandă din aceeași locație', async () => {
      const other = await createOrder();
      await assert.rejects(
        f.txA((tx) => writeDelivery(tx, other.id, { ...assign, operation: { requestKey } })),
      );
      assert.equal(
        await f.txA((tx) => tx.deliveryOperation.count({ where: { orderId: other.id } })),
        0,
      );
      assert.equal(
        (await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: other.id } })))
          .deliveryStatus,
        'WAITING_COURIER',
      );
    });
    await t.test('contextul absent și reutilizarea poolului A→B nu expun livrări', async () => {
      assert.equal(await f.runtime.deliveryOperation.count(), 0);
      assert.equal(
        await f.txA((tx) => tx.deliveryOperation.count({ where: { orderId: order.id } })),
        2,
      );
      assert.equal(
        await f.txB((tx) => tx.deliveryOperation.count({ where: { orderId: order.id } })),
        0,
      );
      assert.equal(await f.runtime.deliveryOperation.count(), 0);
      await assert.rejects(
        f.txB((tx) =>
          writeDelivery(tx, order.id, { toStatus: 'WAITING_COURIER', reason: 'Acces străin' }),
        ),
      );
      await assert.rejects(
        f.runtime.deliveryOperation.create({
          data: { ...assigned, id: randomUUID(), requestKey: randomUUID() },
        }),
      );
    });
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
