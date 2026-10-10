import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import pg from 'pg';
import { assetData } from './fixtures/file-assets.fixture';
import type { OperationsFixture } from './fixtures/operations.types';

export async function runFileAssetConcurrencyTests(t: TestContext, state: OperationsFixture) {
  for (const purpose of ['STAFF_AVATAR', 'PRODUCT_IMAGE']) {
    await t.test(
      `${purpose}: două conexiuni reale, numai versiunea câștigătoare persistă`,
      async () => {
        const isStaff = purpose === 'STAFF_AVATAR';
        const table = isStaff ? 'CompanyUser' : 'Product';
        const column = isStaff ? 'avatarAssetId' : 'imageAssetId';
        const resourceId = isStaff ? state.a.user.id : state.catalogA.product.id;
        const current = await state.txA((tx) =>
          isStaff
            ? tx.companyUser.findUniqueOrThrow({
                where: { id: resourceId },
                select: { version: true },
              })
            : tx.product.findUniqueOrThrow({
                where: { id: resourceId },
                select: { version: true },
              }),
        );
        const assets = await state.txA(async (tx) =>
          Promise.all([0, 1].map(() => tx.fileAsset.create({ data: assetData(state, purpose) }))),
        );
        const winner = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
        const loser = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
        await Promise.all([winner.connect(), loser.connect()]);
        try {
          const pids = await Promise.all(
            [winner, loser].map(async (client) => {
              await client.query('BEGIN');
              await client.query(
                `SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true)`,
                [state.a.organization.id, state.a.user.id],
              );
              return (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
                .rows[0]!.pid;
            }),
          );
          assert.notEqual(pids[0], pids[1]);
          const update = (client: pg.Client, assetId: string) =>
            client.query(
              `UPDATE "${table}" SET "${column}"=$1,version=version+1,"updatedAt"=now() WHERE id=$2 AND version=$3`,
              [assetId, resourceId, current.version],
            );
          assert.equal((await update(winner, assets[0]!.id)).rowCount, 1);
          const pending = update(loser, assets[1]!.id);
          let blocked = false;
          for (let attempt = 0; attempt < 100 && !blocked; attempt += 1) {
            const result = await winner.query<{ blocked: boolean }>(
              'SELECT $1::integer=ANY(pg_blocking_pids($2::integer)) AS blocked',
              [pids[0], pids[1]],
            );
            blocked = result.rows[0]!.blocked;
            if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
          }
          assert.ok(blocked, 'A doua conexiune trebuie să aștepte efectiv rândul resursei');
          await winner.query(
            `INSERT INTO "FileAssetMutation" (id,"organizationId","actorUserId",purpose,"employeeId","productId",action,"assetId","requestKey","requestHash","resourceVersion")
           VALUES ($1,$2,$3,$4,$5,$6,'SET',$7,$8,$9,$10)`,
            [
              randomUUID(),
              state.a.organization.id,
              state.a.user.id,
              purpose,
              isStaff ? resourceId : null,
              isStaff ? null : resourceId,
              assets[0]!.id,
              randomUUID(),
              'e'.repeat(64),
              current.version + 1,
            ],
          );
          await winner.query('COMMIT');
          assert.equal((await pending).rowCount, 0);
          await loser.query('ROLLBACK');
          const outcome = await state.txA((tx) =>
            tx.fileAssetMutation.findFirstOrThrow({
              where: { purpose, resourceVersion: current.version + 1 },
            }),
          );
          assert.equal(outcome.assetId, assets[0]!.id);
        } finally {
          await Promise.all([winner.query('ROLLBACK'), loser.query('ROLLBACK')]);
          await Promise.all([winner.end(), loser.end()]);
        }
      },
    );
  }
}
