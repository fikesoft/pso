import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOrderDeliveryFeeFixture } from './fixtures/order-delivery-fee.fixture';
import { deliveryZoneCommandData } from './fixtures/delivery-zone.fixture';

test('PostgreSQL: taxa de livrare se aplică atomic și păstrează tariful convenit', async () => {
  const f = await createOrderDeliveryFeeFixture();
  try {
    const data = f.command();
    await assert.rejects(
      f.txA(async (tx) => {
        await tx.orderDeliveryFeeCommand.create({ data });
        assert.equal(
          (await tx.order.findUniqueOrThrow({ where: { id: f.order.id } })).total.toFixed(2),
          '35.01',
        );
        throw new Error('rollback taxă');
      }),
      /rollback taxă/,
    );
    assert.equal((await f.current()).deliveryFeeCommandId, null);
    const command = await f.txA((tx) =>
      tx.orderDeliveryFeeCommand.create({
        data: {
          ...data,
          resultVersion: 999,
          zoneCommandId: randomUUID(),
          deliveryAddressHash: 'b'.repeat(64),
          createdAt: new Date(0),
        },
      }),
    );
    assert.equal(command.resultVersion, f.order.version + 1);
    assert.equal(command.zoneCommandId, f.zone.id);
    assert.equal(command.deliveryAddressHash, f.order.deliveryAddressHash);
    assert.ok(command.createdAt.getTime() > 0);
    const priced = await f.current();
    assert.equal(priced.deliveryFeeCommandId, command.id);
    assert.equal(priced.total.toFixed(2), '35.01');
    await assert.rejects(f.txA((tx) => tx.orderDeliveryFeeCommand.create({ data })));
    await assert.rejects(
      f.txA((tx) =>
        tx.orderDeliveryFeeCommand.create({ data: f.command({ expectedVersion: priced.version }) }),
      ),
    );
    await f.txA((tx) =>
      tx.deliveryZoneCommand.create({
        data: deliveryZoneCommandData(f, {
          zoneId: f.zone.zoneId,
          action: 'ARCHIVE',
          expectedVersion: 1,
          profile: undefined,
        }),
      }),
    );
    const noted = await f.txA((tx) =>
      tx.order.update({
        where: { id: f.order.id },
        data: {
          notes: 'Tarif păstrat după arhivare',
          version: { increment: 1 },
        },
      }),
    );
    assert.equal(noted.deliveryFeeCommandId, command.id);
    assert.equal(noted.total.toFixed(2), '35.01');
    await f.txA((tx) =>
      tx.order.update({
        where: { id: f.order.id },
        data: {
          status: 'CONFIRMED',
          version: { increment: 1 },
        },
      }),
    );
  } finally {
    await f.close();
  }
});

test('PostgreSQL: taxa respinge cotații false, actori străini și modificări directe', async () => {
  const f = await createOrderDeliveryFeeFixture();
  try {
    for (const changes of [
      { fee: '0.00', total: '10.01' },
      { subtotal: '100.00', total: '125.00' },
      { zoneVersion: 2 },
      { expectedVersion: 1 },
      { zoneId: randomUUID() },
      { destination: { latitude: 0, longitude: 0 } },
      { destination: { latitude: 47.0200001, longitude: 28.83 } },
      { organizationId: f.b.organization.id },
      { locationId: f.locationA2.id },
      { actorUserId: f.b.user.id },
    ])
      await assert.rejects(
        f.txA((tx) => tx.orderDeliveryFeeCommand.create({ data: f.command(changes) })),
      );
    await assert.rejects(
      f.txA((tx) =>
        tx.order.update({
          where: { id: f.order.id },
          data: {
            deliveryFee: '25.00',
            total: '35.01',
            version: { increment: 1 },
          },
        }),
      ),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.order.update({
          where: { id: f.order.id },
          data: {
            status: 'CONFIRMED',
            version: { increment: 1 },
          },
        }),
      ),
    );
    const command = await f.txA((tx) => tx.orderDeliveryFeeCommand.create({ data: f.command() }));
    assert.equal(await f.runtime.orderDeliveryFeeCommand.count(), 0);
    assert.equal(await f.txB((tx) => tx.orderDeliveryFeeCommand.count()), 0);
    await assert.rejects(
      f.txA((tx) =>
        tx.orderDeliveryFeeCommand.update({ where: { id: command.id }, data: { fee: '0.00' } }),
      ),
    );
    await assert.rejects(
      f.txA((tx) => tx.orderDeliveryFeeCommand.delete({ where: { id: command.id } })),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.order.update({
          where: { id: f.order.id },
          data: {
            deliveryFee: '0.00',
            deliveryFeeCommandId: null,
            total: '10.01',
            version: { increment: 1 },
          },
        }),
      ),
    );
  } finally {
    await f.close();
  }
});

test('PostgreSQL: schimbarea subtotalului invalidează taxa, iar retragerea cheii este terminală', async () => {
  const f = await createOrderDeliveryFeeFixture();
  try {
    await f.txA((tx) => tx.orderDeliveryFeeCommand.create({ data: f.command() }));
    await assert.rejects(
      f.txA(async (tx) => {
        await tx.orderItem.update({
          where: { id: f.item.id },
          data: { quantity: '2.000', lineTotal: '20.01' },
        });
        await tx.order.update({
          where: { id: f.order.id },
          data: { total: '45.01', version: { increment: 1 } },
        });
      }),
    );
    await f.txA(async (tx) => {
      await tx.orderItem.update({
        where: { id: f.item.id },
        data: { quantity: '2.000', lineTotal: '20.01' },
      });
      await tx.order.update({
        where: { id: f.order.id },
        data: {
          deliveryFee: '0.00',
          deliveryFeeCommandId: null,
          total: '20.01',
          version: { increment: 1 },
        },
      });
    });
    assert.equal((await f.current()).deliveryFeeCommandId, null);
    const requestKey = randomUUID();
    await f.txA((tx) =>
      tx.orderDeliveryFeeCommand.create({
        data: {
          organizationId: f.a.organization.id,
          locationId: f.locationA.id,
          orderId: f.order.id,
          actorUserId: f.a.user.id,
          requestKey,
          status: 'RETIRED',
        },
      }),
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.orderDeliveryFeeCommand.create({
          data: f.command({
            requestKey,
            expectedVersion: f.order.version + 2,
            subtotal: '20.01',
            total: '45.01',
          }),
        }),
      ),
    );
  } finally {
    await f.close();
  }
});
