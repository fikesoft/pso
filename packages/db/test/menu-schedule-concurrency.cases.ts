import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import pg from 'pg';
import type { OperationsFixture } from './fixtures/operations.types';

export async function runMenuScheduleRaces(t: TestContext, state: OperationsFixture) {
  const organizationId = state.a.organization.id;
  const locationId = state.locationA.id;
  const secondProduct = await state.txA(async (tx) => {
    const product = await tx.product.create({
      data: {
        organizationId,
        name: 'Al doilea produs',
        sku: 'SCHEDULE-RACE',
        createdByUserId: state.a.user.id,
      },
    });
    await tx.locationProduct.create({
      data: { organizationId, locationId, productId: product.id, price: '2.00' },
    });
    return product;
  });
  for (const isolation of ['READ COMMITTED', 'REPEATABLE READ']) {
    await t.test(`${isolation}: două eliminări concurente nu golesc programul`, async () => {
      const schedule = await state.txA(async (tx) => {
        const value = await tx.menuSchedule.create({
          data: {
            organizationId,
            locationId,
            name: 'Program concurent',
            weekdays: [1],
            startMinute: 0,
            endMinute: 1440,
            requestKey: randomUUID(),
            requestHash: 'a'.repeat(64),
            createdByUserId: state.a.user.id,
          },
        });
        await tx.menuScheduleProduct.createMany({
          data: [state.catalogA.product.id, secondProduct.id].map((productId) => ({
            organizationId,
            locationId,
            menuScheduleId: value.id,
            productId,
          })),
        });
        return value;
      });
      const first = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
      const second = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
      await Promise.all([first.connect(), second.connect()]);
      try {
        const pids = await Promise.all(
          [first, second].map(async (client) => {
            await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
            await client.query(`SET LOCAL statement_timeout='10s'`);
            await client.query(
              `SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true)`,
              [organizationId, state.a.user.id],
            );
            await client.query('SELECT count(*) FROM "MenuScheduleProduct"');
            return (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
              .pid;
          }),
        );
        assert.notEqual(pids[0], pids[1]);
        const remove = (client: pg.Client, productId: string) =>
          client.query(
            'DELETE FROM "MenuScheduleProduct" WHERE "menuScheduleId"=$1 AND "productId"=$2',
            [schedule.id, productId],
          );
        await remove(first, state.catalogA.product.id);
        const pending = remove(second, secondProduct.id)
          .then(async () => {
            await second.query('COMMIT');
            return null;
          })
          .catch((error: unknown) => error as { code: string });
        let blocked = false;
        for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
          blocked = (
            await first.query<{ blocked: boolean }>(
              'SELECT $1::integer=ANY(pg_blocking_pids($2::integer)) AS blocked',
              pids,
            )
          ).rows[0]!.blocked;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.ok(blocked);
        await first.query('COMMIT');
        const failure = await pending;
        assert.ok(failure);
        assert.ok(['23514', '40001'].includes(failure.code));
        await second.query('ROLLBACK');
        assert.equal(
          await state.txA((tx) =>
            tx.menuScheduleProduct.count({ where: { menuScheduleId: schedule.id } }),
          ),
          1,
        );
      } finally {
        await Promise.all([first.query('ROLLBACK'), second.query('ROLLBACK')]);
        await Promise.all([first.end(), second.end()]);
      }
    });
  }
}
