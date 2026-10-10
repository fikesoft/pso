import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import {
  claimJobs,
  completeJob,
  enqueueJob,
  getJob,
  assertWorkerDatabaseRole,
} from '../../jobs/src/index';
import type { JobsFixture } from './fixtures/jobs.types';

export async function jobsSecurityCases(t: TestContext, s: JobsFixture) {
  await t.test('definer ACLs, fixed search path and nonprivileged owner are explicit', async () => {
    const rows = await s.runtime.$queryRaw<
      Array<{
        name: string;
        publicExecute: boolean;
        runtimeExecute: boolean;
        workerExecute: boolean;
        fixedPath: boolean;
        ownerSafe: boolean;
      }>
    >`
      SELECT p.proname AS name,
        EXISTS(SELECT 1 FROM aclexplode(p.proacl) a
          WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS "publicExecute",
        has_function_privilege('pos_runtime',p.oid,'EXECUTE') AS "runtimeExecute",
        has_function_privilege('pos_worker',p.oid,'EXECUTE') AS "workerExecute",
        p.prosecdef AND 'search_path=pg_catalog'=ANY(p.proconfig) AS "fixedPath",
        NOT (r.rolcanlogin OR r.rolsuper OR r.rolbypassrls) AS "ownerSafe"
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='pos_jobs'`;
    assert.equal(rows.length, 4);
    for (const row of rows) {
      assert.equal(row.publicExecute, false);
      assert.equal(row.fixedPath, true);
      assert.equal(row.ownerSafe, true);
      assert.equal(row.runtimeExecute, row.name === 'enqueue');
      assert.equal(row.workerExecute, row.name !== 'enqueue');
    }
  });
  await t.test(
    'enqueue atomic, idempotent, canonical payload hash and conflict detection',
    async () => {
      const input = {
        organizationId: s.a.organization.id,
        kind: 'maintenance.database_health',
        idempotencyKey: randomUUID(),
        payload: { a: 1, b: 2 },
      };
      const [first, duplicate] = await Promise.all([
        s.txA((tx) => enqueueJob(tx, input)),
        s.txA((tx) => enqueueJob(tx, { ...input, payload: { b: 2, a: 1 } })),
      ]);
      assert.equal(first.id, duplicate.id);
      await assert.rejects(s.txA((tx) => enqueueJob(tx, { ...input, payload: { a: 3 } })));
      const rolledBack = randomUUID();
      await assert.rejects(
        s.txA(async (tx) => {
          await enqueueJob(tx, { ...input, idempotencyKey: rolledBack });
          throw new Error('rollback');
        }),
      );
      const rows = await s.txA(
        (tx) => tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM "BackgroundJob" WHERE "idempotencyKey"=${rolledBack}`,
      );
      assert.equal(rows[0]?.count, 0n);
      const job = (await claimJobs(s.worker, randomUUID()))[0];
      assert.equal(job?.id, first.id);
      assert.ok(
        await s.workerTx(job.organizationId, (tx) =>
          completeJob(tx, job.organizationId, job.id, job.leaseToken, {}),
        ),
      );
    },
  );
  await t.test('RLS, missing context, cross-tenant enqueue and least privileges', async () => {
    const job = await s.enqueue(randomUUID());
    assert.equal(await s.txB((tx) => getJob(tx, job.id)), null);
    assert.equal(await getJob(s.runtime, job.id), null);
    await assert.rejects(
      enqueueJob(s.runtime, {
        organizationId: s.a.organization.id,
        kind: 'maintenance.database_health',
        idempotencyKey: randomUUID(),
        payload: {},
      }),
    );
    await assert.rejects(
      s.txA((tx) =>
        enqueueJob(tx, {
          organizationId: s.b.organization.id,
          kind: 'maintenance.database_health',
          idempotencyKey: randomUUID(),
          payload: {},
        }),
      ),
    );
    await assert.rejects(claimJobs(s.runtime, randomUUID()));
    await assert.rejects(s.runtime.$executeRaw`UPDATE "BackgroundJob" SET status='COMPLETED'`);
    await assert.rejects(s.worker.$queryRaw`SELECT * FROM "BackgroundJob"`);
    await assert.rejects(s.worker.$queryRaw`SELECT * FROM "CompanyUser"`);
    await assert.rejects(s.worker.$executeRaw`SET ROLE pos_internal`);
    await assert.rejects(assertWorkerDatabaseRole(s.runtime));
    const claimed = (await claimJobs(s.worker, randomUUID()))[0];
    assert.equal(claimed?.id, job.id);
    await assert.rejects(completeJob(s.worker, job.organizationId, job.id, claimed.leaseToken, {}));
    await assert.rejects(
      s.workerTx(s.b.organization.id, (tx) =>
        completeJob(tx, job.organizationId, job.id, claimed.leaseToken, {}),
      ),
    );
    await assert.rejects(
      s.txA((tx) => completeJob(tx, job.organizationId, job.id, claimed.leaseToken, {})),
    );
    assert.equal(
      await s.workerTx(s.b.organization.id, (tx) =>
        completeJob(tx, s.b.organization.id, job.id, claimed.leaseToken, {}),
      ),
      false,
    );
    assert.ok(
      await s.workerTx(job.organizationId, (tx) =>
        completeJob(tx, job.organizationId, job.id, claimed.leaseToken, {}),
      ),
    );
  });
}
