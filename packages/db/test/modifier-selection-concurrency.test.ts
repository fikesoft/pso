import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { createModifierFixture } from './fixtures/modifier.fixture';
import type { OperationsFixture } from './fixtures/operations.types';
import type { ModifierFixture } from './fixtures/modifier.types';

async function insertSelection(
  client: pg.Client,
  state: OperationsFixture,
  modifier: ModifierFixture,
) {
  const organizationId = state.a.organization.id;
  const locationId = state.locationA.id;
  const orderId = randomUUID();
  const orderItemId = randomUUID();
  const groupId = randomUUID();
  await client.query(
    `INSERT INTO "Order" (id,"organizationId","locationId",number,"serviceType","tableLabel",total,
      "clientRequestId","creationRequestHash","createdByUserId","updatedByUserId","updatedAt")
     VALUES ($1,$2,$3,1,'DINE_IN','Concurență',10.34,$4,$5,$6,$6,now())`,
    [orderId, organizationId, locationId, randomUUID(), 'a'.repeat(64), state.a.user.id],
  );
  await client.query(
    `INSERT INTO "OrderItem" (id,"organizationId","locationId","orderId","productId",position,
      "productName","productSku","baseUnitPrice","unitPrice",quantity,"lineTotal","updatedAt")
     VALUES ($1,$2,$3,$4,$5,0,$6,$7,10.005,10.3383,1,10.34,now())`,
    [
      orderItemId,
      organizationId,
      locationId,
      orderId,
      state.catalogA.product.id,
      state.catalogA.product.name,
      state.catalogA.product.sku,
    ],
  );
  await client.query(
    `INSERT INTO "OrderItemModifierGroup" (id,"organizationId","locationId","orderItemId",
      "productModifierGroupId","modifierGroupId","groupName","minSelections","maxSelections",
      "groupVersion","bindingVersion",position) VALUES ($1,$2,$3,$4,$5,$6,$7,1,1,$8,1,0)`,
    [
      groupId,
      organizationId,
      locationId,
      orderItemId,
      modifier.binding.id,
      modifier.group.id,
      modifier.group.name,
      modifier.group.version,
    ],
  );
  await client.query(
    `INSERT INTO "OrderItemModifier" (id,"organizationId","locationId","orderItemId",
      "modifierGroupSnapshotId","modifierGroupId","modifierOptionId","optionName","extraPrice",
      "optionVersion",position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0.3333,1,0)`,
    [
      randomUUID(),
      organizationId,
      locationId,
      orderItemId,
      groupId,
      modifier.group.id,
      modifier.options[0]!.id,
      modifier.options[0]!.name,
    ],
  );
}

test('PostgreSQL real: alegerea și editarea concurentă a modificatorului se serializează', async (t) => {
  for (const isolation of ['READ COMMITTED', 'REPEATABLE READ']) {
    for (const selectionFirst of [true, false]) {
      await t.test(
        `${isolation}: ${selectionFirst ? 'alegerea' : 'editarea'} deține prima blocarea`,
        async () => {
          const state = await createOperationsFixture();
          const modifier = await createModifierFixture(state);
          const first = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
          const second = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
          await Promise.all([first.connect(), second.connect()]);
          try {
            const pids = await Promise.all(
              [first, second].map(async (client) => {
                await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
                await client.query(
                  `SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true)`,
                  [state.a.organization.id, state.a.user.id],
                );
                await client.query('SELECT count(*) FROM "ModifierGroup"');
                return (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
                  .rows[0]!.pid;
              }),
            );
            assert.notEqual(pids[0], pids[1]);
            const edit = (client: pg.Client) =>
              client.query(
                `UPDATE "ModifierOption" SET name='Ulterior',"extraPrice"=1.9999,
              version=version+1,"updatedAt"=now() WHERE id=$1`,
                [modifier.options[0]!.id],
              );
            await (selectionFirst ? insertSelection(first, state, modifier) : edit(first));
            const pending = (
              selectionFirst ? edit(second) : insertSelection(second, state, modifier)
            )
              .then(async () => {
                await second.query('COMMIT');
                return null;
              })
              .catch((error: unknown) => error as { code: string });
            let blocked = false;
            for (let attempt = 0; attempt < 100 && !blocked; attempt += 1) {
              blocked = (
                await first.query<{ blocked: boolean }>(
                  'SELECT $1::integer=ANY(pg_blocking_pids($2::integer)) AS blocked',
                  pids,
                )
              ).rows[0]!.blocked;
              if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
            }
            assert.ok(blocked, 'Contender must wait on the other PostgreSQL connection');
            await first.query('COMMIT');
            const failure = await pending;
            if (selectionFirst) assert.equal(failure, null);
            else {
              assert.ok(failure);
              assert.ok(['23514', '40001'].includes(failure.code), failure.code);
            }
            await second.query('ROLLBACK');
            const rows = await state.txA((tx) => tx.orderItemModifier.findMany());
            assert.equal(rows.length, selectionFirst ? 1 : 0);
            if (selectionFirst) {
              assert.equal(rows[0]!.extraPrice.toFixed(4), '0.3333');
              assert.equal(rows[0]!.optionName, modifier.options[0]!.name);
            }
            assert.equal(
              (
                await state.txA((tx) =>
                  tx.modifierOption.findUniqueOrThrow({
                    where: { id: modifier.options[0]!.id },
                  }),
                )
              ).extraPrice.toFixed(4),
              '1.9999',
            );
          } finally {
            await Promise.all([first.query('ROLLBACK'), second.query('ROLLBACK')]);
            await Promise.all([first.end(), second.end()]);
            await Promise.all([
              state.runtime.$disconnect(),
              state.platform.$disconnect(),
              state.auth.$disconnect(),
            ]);
          }
        },
      );
    }
  }
});
