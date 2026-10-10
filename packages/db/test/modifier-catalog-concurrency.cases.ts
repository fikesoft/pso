import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import pg from 'pg';
import { createModifierFixture } from './fixtures/modifier.fixture';
import type { OperationsFixture } from './fixtures/operations.types';

export async function runModifierCatalogRaces(t: TestContext, state: OperationsFixture) {
  for (const isolation of ['READ COMMITTED', 'REPEATABLE READ']) {
    await t.test(`${isolation}: arhivări concurente nu golesc grupul obligatoriu`, async () => {
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
            await client.query('SELECT count(*) FROM "ModifierOption"');
            return (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
              .pid;
          }),
        );
        assert.notEqual(pids[0], pids[1]);
        const archive = (client: pg.Client, id: string) =>
          client.query(
            `UPDATE "ModifierOption" SET status='ARCHIVED',version=version+1,"updatedAt"=now() WHERE id=$1`,
            [id],
          );
        await archive(first, modifier.options[0]!.id);
        const pending = archive(second, modifier.options[1]!.id)
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
        assert.ok(blocked);
        await first.query('COMMIT');
        const failure = await pending;
        assert.ok(failure);
        assert.ok(['23514', '40001'].includes(failure.code));
        await second.query('ROLLBACK');
        assert.equal(
          await state.txA((tx) =>
            tx.modifierOption.count({
              where: { modifierGroupId: modifier.group.id, status: 'ACTIVE' },
            }),
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
