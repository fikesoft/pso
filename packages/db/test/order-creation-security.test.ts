import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { creationOrderData, retireCreation } from './fixtures/order-creation.fixture';

test('PostgreSQL real: identități terminale de creare, RLS și imposibilitatea reactivării', async (t) => {
  const f = await createOperationsFixture();
  try {
    const key = randomUUID();
    const order = await f.txA((tx) => tx.order.create({ data: creationOrderData(f, key) }));
    const claim = await f.txA((tx) =>
      tx.orderCreationClaim.findFirstOrThrow({ where: { requestKey: key } }),
    );
    await t.test(
      'comanda și identitatea exactă se salvează atomic, inclusiv hashul și actorul',
      async () => {
        assert.equal(claim.status, 'CREATED');
        assert.equal(claim.orderId, order.id);
        assert.equal(claim.requestHash, order.creationRequestHash);
        assert.equal(claim.actorUserId, order.createdByUserId);
        assert.equal(claim.organizationId, order.organizationId);
        assert.equal(claim.locationId, order.locationId);
        await assert.rejects(
          f.txA((tx) => retireCreation(tx, f, key)),
          /uncreated order key/,
        );
        const rollbackKey = randomUUID();
        await assert.rejects(
          f.txA(async (tx) => {
            await tx.order.create({ data: creationOrderData(f, rollbackKey, { number: 2 }) });
            throw new Error('Rollback sintetic');
          }),
          /Rollback sintetic/,
        );
        assert.equal(
          await f.txA((tx) => tx.orderCreationClaim.count({ where: { requestKey: rollbackKey } })),
          0,
        );
        assert.equal(
          await f.txA((tx) => tx.order.count({ where: { clientRequestId: rollbackKey } })),
          0,
        );
      },
    );
    const retiredKey = randomUUID();
    const retired = await f.txA((tx) => retireCreation(tx, f, retiredKey));
    await t.test('retragerea cheii este definitivă și refuză orice corp întârziat', async () => {
      for (const creationRequestHash of ['d'.repeat(64), 'e'.repeat(64)])
        await assert.rejects(
          f.txA((tx) =>
            tx.order.create({
              data: creationOrderData(f, retiredKey, { number: 2, creationRequestHash }),
            }),
          ),
        );
      assert.equal(
        await f.txA((tx) => tx.order.count({ where: { clientRequestId: retiredKey } })),
        0,
      );
      assert.equal(
        (
          await f.txA((tx) =>
            tx.orderCreationClaim.findUniqueOrThrow({ where: { id: retired.id } }),
          )
        ).status,
        'RETIRED',
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.orderCreationClaim.update({
            where: { id: retired.id },
            data: { status: 'CREATED', orderId: order.id, requestHash: order.creationRequestHash },
          }),
        ),
      );
      await assert.rejects(
        f.txA((tx) => tx.orderCreationClaim.delete({ where: { id: retired.id } })),
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.orderCreationClaim.update({
            where: { id: claim.id },
            data: { requestHash: 'f'.repeat(64) },
          }),
        ),
      );
    });
    await t.test(
      'rolul runtime nu poate fabrica identități CREATED sau legături străine',
      async () => {
        for (const data of [
          { status: 'CREATED', orderId: null, requestHash: 'e'.repeat(64) },
          { status: 'CREATED', orderId: randomUUID(), requestHash: 'e'.repeat(64) },
          { status: 'CREATED', orderId: order.id, requestHash: 'e'.repeat(64) },
          { status: 'RETIRED', orderId: order.id, requestHash: null },
          { status: 'RETIRED', orderId: null, requestHash: 'e'.repeat(64) },
        ])
          await assert.rejects(
            f.txA((tx) =>
              tx.orderCreationClaim.create({
                data: { ...retired, id: randomUUID(), requestKey: randomUUID(), ...data },
              }),
            ),
          );
        await assert.rejects(
          f.txA((tx) =>
            tx.orderCreationClaim.create({
              data: {
                ...retired,
                id: randomUUID(),
                requestKey: randomUUID(),
                locationId: f.locationB.id,
              },
            }),
          ),
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.orderCreationClaim.create({
              data: {
                ...retired,
                id: randomUUID(),
                requestKey: randomUUID(),
                actorUserId: f.b.user.id,
              },
            }),
          ),
        );
      },
    );
    await t.test(
      'RLS/ACL și contextul actorului protejează revendicările la reutilizarea poolului',
      async () => {
        assert.equal(await f.runtime.orderCreationClaim.count(), 0);
        assert.equal(await f.txA((tx) => tx.orderCreationClaim.count()), 2);
        assert.equal(await f.txB((tx) => tx.orderCreationClaim.count()), 0);
        assert.equal(await f.runtime.orderCreationClaim.count(), 0);
        await assert.rejects(retireCreation(f.runtime, f, randomUUID()));
        await assert.rejects(f.txB((tx) => retireCreation(tx, f, randomUUID())));
        await assert.rejects(
          f.txA(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.user_id','',true)`;
            await retireCreation(tx, f, randomUUID());
          }),
          /scoped actor/,
        );
        const [acl] = await f.runtime.$queryRaw<
          Array<{ forced: boolean; update: boolean; delete: boolean; platform: boolean }>
        >`
        SELECT relforcerowsecurity AS forced,
          has_table_privilege(current_user,'"OrderCreationClaim"','UPDATE') AS update,
          has_table_privilege(current_user,'"OrderCreationClaim"','DELETE') AS delete,
          has_table_privilege('pos_platform','"OrderCreationClaim"','SELECT') AS platform
        FROM pg_class WHERE oid='"OrderCreationClaim"'::regclass`;
        assert.deepEqual(acl, { forced: true, update: false, delete: false, platform: false });
      },
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
