import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { publishKitchenFixture } from './operations-kitchen.fixture';
import { readyInventoryOrder } from './inventory-finalize.fixture';
import type { InventoryFixture } from './inventory.types';

export async function prepareLegacyInventoryOrder(state: InventoryFixture) {
  const draft = await state.createDraft();
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.notEqual(process.env.NODE_ENV, 'production');
  url.pathname = '/pos_test';
  const migration = await readFile(
    new URL(
      '../../prisma/migrations/202609250012_inventory_legacy_orders/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const backfill = migration.match(/INSERT INTO "InventoryLegacyOrder"[\s\S]+?;/)?.[0];
  assert.ok(backfill);
  // The lifecycle migration keeps old rows and translates OPEN at read time. Reproduce
  // the same sent-only classification using the corresponding current stages.
  const currentStageBackfill = backfill.replace(
    "o.status IN ('OPEN','COMPLETED')",
    "public.effective_order_status(o.status,o.\"kitchenStatus\") IN ('CONFIRMED','IN_PROGRESS','READY','COMPLETED') AND o.\"kitchenStatus\"<>'NOT_SENT'",
  );
  const sourcePolicies = migration.match(/CREATE POLICY inventory_upgrade_read[^;]+;/g)!;
  assert.equal(sourcePolicies.length, 3);
  const identity = draft.order.id.replaceAll('-', '');
  const functionName = `inventory_legacy_fixture_${identity}`;
  const policyName = `inventory_fixture_${identity}`;
  assert.match(draft.order.id, /^[a-f0-9-]{36}$/);
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  // Reproduce the migration-only classification while this synthetic legacy send is
  // still uncommitted. Every runtime trigger remains enabled. The temporary function
  // accepts no arguments and can classify only this exact order/tenant/actor.
  try {
    await client.query('BEGIN');
    for (const policy of sourcePolicies) await client.query(policy);
    await client.query(`CREATE POLICY "${policyName}" ON "InventoryLegacyOrder"
      FOR INSERT TO pos_migrator WITH CHECK ("orderId"='${draft.order.id}'::uuid)`);
    await client.query(`CREATE FUNCTION public."${functionName}"() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fixture$
      BEGIN
        IF current_setting('app.organization_id',true) IS DISTINCT FROM '${state.a.organization.id}'
          OR current_setting('app.user_id',true) IS DISTINCT FROM '${state.a.user.id}' THEN
          RAISE EXCEPTION 'fixture scope mismatch';
        END IF;
        ${currentStageBackfill.slice(0, -1)} AND o.id='${draft.order.id}'::uuid;
        IF NOT FOUND THEN RAISE EXCEPTION 'legacy migration must classify exactly one order'; END IF;
      END $fixture$`);
    await client.query(`REVOKE ALL ON FUNCTION public."${functionName}"() FROM PUBLIC`);
    await client.query(`GRANT EXECUTE ON FUNCTION public."${functionName}"() TO pos_runtime`);
    await client.query('COMMIT');
    const sent = await publishKitchenFixture(state, draft, {
      omitReservation: true,
      afterSend: async (tx) => {
        await tx.$executeRawUnsafe(`SELECT public."${functionName}"()`);
      },
    });
    return await readyInventoryOrder(state, { order: draft.order, ticket: sent.ticket });
  } finally {
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await client.query(`DROP FUNCTION IF EXISTS public."${functionName}"()`);
    await client.query(`DROP POLICY IF EXISTS "${policyName}" ON "InventoryLegacyOrder"`);
    for (const table of ['Order', 'InventoryDocument', 'InventoryReservation']) {
      await client.query(`DROP POLICY IF EXISTS inventory_upgrade_read ON "${table}"`);
    }
    await client.query('COMMIT');
    await client.end();
  }
}
