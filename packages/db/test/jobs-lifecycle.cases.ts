import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import type { TestContext } from 'node:test';
import { claimJobs, completeJob, enqueueJob, failJob, getJob } from '../../jobs/src/index';
import { processJob } from '../../../apps/worker/src/model/process-job';
import type { JobsFixture } from './fixtures/jobs.types';

export async function jobsLifecycleCases(t: TestContext, s: JobsFixture) {
  await t.test('concurrent claims are disjoint across tenants', async () => {
    const a = await s.enqueue(randomUUID());
    const b = await s.txB((tx) =>
      enqueueJob(tx, {
        organizationId: s.b.organization.id,
        kind: 'maintenance.database_health',
        idempotencyKey: randomUUID(),
        payload: {},
      }),
    );
    const [one, two] = await Promise.all([
      claimJobs(s.worker, randomUUID()),
      claimJobs(s.worker, randomUUID()),
    ]);
    assert.deepEqual(new Set([one[0]?.id, two[0]?.id]), new Set([a.id, b.id]));
    for (const job of [...one, ...two]) assert.ok(await processJob(s.worker, job));
    const saved = await s.txA((tx) => getJob(tx, a.id));
    assert.equal(saved?.status, 'COMPLETED');
    assert.equal(saved?.result?.databaseReachable, true);
    assert.ok(saved?.result?.checkedAt);
  });
  await t.test('crashed lease reclaimed; stale and wrong fences cannot ack or fail', async () => {
    const queued = await s.enqueue(randomUUID());
    const first = (await claimJobs(s.worker, randomUUID(), 1, 1))[0];
    assert.equal(first?.id, queued.id);
    await setTimeout(1100);
    assert.equal(
      await s.workerTx(first.organizationId, (tx) =>
        completeJob(tx, first.organizationId, first.id, first.leaseToken, {}),
      ),
      false,
    );
    const second = (await claimJobs(s.worker, randomUUID()))[0];
    assert.equal(second?.id, first.id);
    assert.notEqual(second.leaseToken, first.leaseToken);
    assert.equal(second.attempts, 2);
    assert.equal(
      await s.workerTx(first.organizationId, (tx) =>
        failJob(tx, first.organizationId, first.id, first.leaseToken, 'STALE'),
      ),
      false,
    );
    assert.equal(
      await s.workerTx(second.organizationId, (tx) =>
        completeJob(tx, second.organizationId, second.id, randomUUID(), {}),
      ),
      false,
    );
    assert.ok(await processJob(s.worker, second));
  });
  await t.test(
    'bounded exponential retry becomes dead letter and remains inspectable',
    async () => {
      const queued = await s.enqueue(randomUUID(), 2);
      const first = (await claimJobs(s.worker, randomUUID()))[0];
      assert.equal(first?.id, queued.id);
      const before = Date.now();
      assert.ok(
        await s.workerTx(first.organizationId, (tx) =>
          failJob(tx, first.organizationId, first.id, first.leaseToken, 'TEST_RETRY'),
        ),
      );
      const pending = await s.txA((tx) => getJob(tx, first.id));
      assert.equal(pending?.status, 'PENDING');
      assert.ok(new Date(pending!.availableAt).getTime() >= before + 900);
      assert.equal((await claimJobs(s.worker, randomUUID())).length, 0);
      await setTimeout(1100);
      const second = (await claimJobs(s.worker, randomUUID()))[0];
      assert.equal(second?.id, first.id);
      assert.ok(
        await s.workerTx(second.organizationId, (tx) =>
          failJob(tx, second.organizationId, second.id, second.leaseToken, 'TEST_EXHAUSTED'),
        ),
      );
      const dead = await s.txA((tx) => getJob(tx, first.id));
      assert.equal(dead?.status, 'DEAD');
      assert.equal(dead?.attempts, 2);
      assert.equal(dead?.lastErrorCode, 'TEST_EXHAUSTED');
      assert.equal((await claimJobs(s.worker, randomUUID())).length, 0);
    },
  );
  await t.test('last crashed attempt is dead-lettered; invalid claim limits denied', async () => {
    const queued = await s.enqueue(randomUUID(), 1);
    const claimed = (await claimJobs(s.worker, randomUUID(), 1, 1))[0];
    assert.equal(claimed?.id, queued.id);
    await setTimeout(1100);
    assert.equal((await claimJobs(s.worker, randomUUID())).length, 0);
    assert.equal((await s.txA((tx) => getJob(tx, queued.id)))?.status, 'DEAD');
    await assert.rejects(claimJobs(s.worker, randomUUID(), 21));
    await assert.rejects(claimJobs(s.worker, randomUUID(), 1, 301));
  });
}
