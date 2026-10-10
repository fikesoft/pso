import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import pg from 'pg';
import type { CatalogRace } from './fixtures/catalog.types';
import type { OperationsFixture } from './fixtures/operations.types';

async function raceCategoryArchive(state: OperationsFixture, scenario: CatalogRace) {
  const category = await state.txA((tx) =>
    tx.category.create({
      data: { organizationId: state.a.organization.id, name: randomUUID() },
    }),
  );
  const productId = randomUUID();
  if (scenario.productAction === 'restore') {
    await state.txA((tx) =>
      tx.product.create({
        data: {
          id: productId,
          organizationId: state.a.organization.id,
          categoryId: category.id,
          name: 'Produs arhivat pentru concurență',
          sku: randomUUID(),
          status: 'ARCHIVED',
          createdByUserId: state.a.user.id,
        },
      }),
    );
  }
  const winner = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  const loser = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await Promise.all([winner.connect(), loser.connect()]);
  const categoryAction = (client: pg.Client) =>
    client.query(
      `UPDATE "Category" SET status='ARCHIVED',version=version+1,"updatedAt"=now() WHERE id=$1`,
      [category.id],
    );
  const productAction = (client: pg.Client) =>
    scenario.productAction === 'restore'
      ? client.query(
          `UPDATE "Product" SET status='ACTIVE',version=version+1,"updatedAt"=now() WHERE id=$1`,
          [productId],
        )
      : client.query(
          `INSERT INTO "Product" (id,"organizationId","categoryId",name,sku,"createdByUserId","updatedAt")
            VALUES ($1,$2,$3,'Produs concurent',$4,$5,now())`,
          [productId, state.a.organization.id, category.id, randomUUID(), state.a.user.id],
        );
  try {
    const identities = await Promise.all(
      [winner, loser].map(async (client) => {
        await client.query(`BEGIN ISOLATION LEVEL ${scenario.isolation}`);
        await client.query(
          `SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true)`,
          [state.a.organization.id, state.a.user.id],
        );
        // Establish both snapshots before either writer proceeds, including REPEATABLE READ.
        await client.query('SELECT count(*) FROM "Product"');
        return (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      }),
    );
    assert.notEqual(identities[0], identities[1]);
    const first = scenario.winner === 'category' ? categoryAction : productAction;
    const second = scenario.winner === 'category' ? productAction : categoryAction;
    await first(winner);
    const pending = second(loser).then(
      () => null,
      (error: unknown) => error as { code: string },
    );
    let blocked = false;
    for (let attempt = 0; attempt < 100 && !blocked; attempt += 1) {
      const result = await winner.query<{ blocked: boolean }>(
        'SELECT $1::integer=ANY(pg_blocking_pids($2::integer)) AS blocked',
        [identities[0], identities[1]],
      );
      blocked = result.rows[0]!.blocked;
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(blocked, 'Conexiunea concurentă trebuie să aștepte efectiv blocarea PostgreSQL');
    await winner.query('COMMIT');
    const failure = await pending;
    assert.ok(failure, 'A doua acțiune trebuie să fie respinsă');
    assert.ok(
      ['23503', '40001'].includes(failure.code),
      `Cod PostgreSQL neașteptat: ${failure.code}`,
    );
    await loser.query('ROLLBACK');
    const stored = await state.txA(async (tx) => ({
      category: await tx.category.findUniqueOrThrow({ where: { id: category.id } }),
      product: await tx.product.findUnique({ where: { id: productId } }),
    }));
    if (scenario.winner === 'product') {
      assert.equal(stored.category.status, 'ACTIVE');
      assert.equal(stored.product?.status, 'ACTIVE');
    } else {
      assert.equal(stored.category.status, 'ARCHIVED');
      assert.equal(
        stored.product?.status ?? null,
        scenario.productAction === 'restore' ? 'ARCHIVED' : null,
      );
    }
  } finally {
    await Promise.all([winner.query('ROLLBACK'), loser.query('ROLLBACK')]);
    await Promise.all([winner.end(), loser.end()]);
  }
}

export async function runCatalogConcurrencyTests(t: TestContext, state: OperationsFixture) {
  for (const isolation of ['READ COMMITTED', 'REPEATABLE READ'] as const) {
    for (const productAction of ['create', 'restore'] as const) {
      for (const winner of ['category', 'product'] as const) {
        await t.test(`${isolation}: ${productAction}, prima acțiune ${winner}`, async () => {
          await raceCategoryArchive(state, { isolation, productAction, winner });
        });
      }
    }
  }
}
