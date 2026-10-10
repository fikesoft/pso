import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { OperationsFixture, OperationsRlsStatus } from './fixtures/operations.types';

export async function runOperationsIsolationTests(t: TestContext, state: OperationsFixture) {
  const { runtime, platform, auth, a, b, txA, txB, catalogA, catalogB, locationA, locationB } =
    state;
  await t.test('RLS fără context și după reutilizarea conexiunii A→B', async () => {
    const policies = await runtime.$queryRaw<OperationsRlsStatus[]>`
      SELECT c.relname AS "tableName", c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
        ('Category','Product','LocationProduct','Order','OrderItem','KitchenTicket','KitchenTicketItem','OrderStatusEvent')`;
    assert.equal(policies.length, 8);
    assert.ok(policies.every((policy) => policy.enabled && policy.forced));
    assert.deepEqual(await runtime.category.findMany(), []);
    assert.deepEqual(await runtime.product.findMany(), []);
    assert.deepEqual(await runtime.locationProduct.findMany(), []);
    assert.deepEqual(await runtime.order.findMany(), []);
    assert.deepEqual(await runtime.orderItem.findMany(), []);
    assert.deepEqual(await runtime.kitchenTicket.findMany(), []);
    assert.deepEqual(await runtime.kitchenTicketItem.findMany(), []);
    assert.deepEqual(await runtime.orderStatusEvent.findMany(), []);
    assert.equal((await txA((tx) => tx.product.findMany())).length, 1);
    const productsB = await txB((tx) => tx.product.findMany());
    assert.deepEqual(
      productsB.map((product) => product.id),
      [catalogB.product.id],
    );
    assert.deepEqual(await runtime.product.findMany(), []);
    assert.equal(
      await txA((tx) => tx.product.findUnique({ where: { id: catalogB.product.id } })),
      null,
    );
    await assert.rejects(
      runtime.category.create({
        data: { organizationId: a.organization.id, name: 'Fără context' },
      }),
    );
    await assert.rejects(
      txA((tx) =>
        tx.category.create({ data: { organizationId: b.organization.id, name: 'Interzis' } }),
      ),
    );
  });
  await t.test('identitățile auth/platform nu au acces la domeniul operațional', async () => {
    for (const client of [platform, auth]) {
      await assert.rejects(client.category.findMany());
      await assert.rejects(client.product.findMany());
      await assert.rejects(client.locationProduct.findMany());
      await assert.rejects(client.order.findMany());
      await assert.rejects(client.orderItem.findMany());
      await assert.rejects(client.kitchenTicket.findMany());
      await assert.rejects(client.kitchenTicketItem.findMany());
      await assert.rejects(client.orderStatusEvent.findMany());
    }
  });
  await t.test('FK compuse blochează catalogul, prețurile și autorii cross-tenant', async () => {
    await assert.rejects(
      txA((tx) =>
        tx.product.create({
          data: {
            organizationId: a.organization.id,
            categoryId: catalogB.category.id,
            name: 'FK sintetic',
            sku: 'BAD-CATEGORY',
            createdByUserId: a.user.id,
          },
        }),
      ),
    );
    await assert.rejects(
      txA((tx) =>
        tx.product.create({
          data: {
            organizationId: a.organization.id,
            name: 'FK sintetic',
            sku: 'BAD-ACTOR',
            createdByUserId: b.user.id,
          },
        }),
      ),
    );
    for (const data of [
      { locationId: locationB.id, productId: catalogA.product.id },
      { locationId: locationA.id, productId: catalogB.product.id },
    ]) {
      await assert.rejects(
        txA((tx) =>
          tx.locationProduct.create({
            data: {
              organizationId: a.organization.id,
              ...data,
              price: '10.00',
            },
          }),
        ),
      );
    }
    await assert.rejects(state.createDraft('a', locationB.id));
  });
  await t.test('FK comandă/articol/event nu acceptă altă locație sau companie', async () => {
    const draft = await state.createDraft();
    const other = await state.createDraft('b');
    for (const data of [
      { locationId: state.locationA2.id, orderId: draft.order.id, productId: catalogA.product.id },
      { locationId: locationA.id, orderId: other.order.id, productId: catalogA.product.id },
      { locationId: locationA.id, orderId: draft.order.id, productId: catalogB.product.id },
    ]) {
      await assert.rejects(
        txA((tx) =>
          tx.orderItem.create({
            data: {
              organizationId: a.organization.id,
              ...data,
              position: 99,
              productName: 'FK sintetic',
              productSku: 'SYNTHETIC',
              unitPrice: '0',
              quantity: '1',
              lineTotal: '0',
            },
          }),
        ),
      );
    }
    await assert.rejects(
      txA((tx) =>
        tx.orderStatusEvent.create({
          data: {
            organizationId: a.organization.id,
            locationId: state.locationA2.id,
            orderId: draft.order.id,
            actorUserId: a.user.id,
            kind: 'ORDER',
            toStatus: 'DRAFT',
          },
        }),
      ),
    );
    assert.deepEqual(
      await txA(
        (tx) => tx.$queryRaw`
      SELECT o.id FROM "Order" o JOIN "OrderItem" i ON i."orderId"=o.id
      WHERE o.id=${other.order.id}::uuid`,
      ),
      [],
    );
    await assert.rejects(
      txA((tx) =>
        tx.order.update({
          where: { id: draft.order.id },
          data: {
            organizationId: b.organization.id,
            version: { increment: 1 },
            clientRequestId: randomUUID(),
          },
        }),
      ),
    );
  });
}
