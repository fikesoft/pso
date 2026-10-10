import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { getJob } from '../../jobs/src/index';
import { createJobsFixture } from './fixtures/jobs.fixture';

// Run separately from test:db: the real worker competes for leases with queue tests.
async function smokeWorkerProcess() {
  const state = await createJobsFixture();
  const source = process.env.TEST_WORKER_DATABASE_URL ?? process.env.WORKER_DATABASE_URL;
  assert.ok(source);
  const workerUrl = new URL(source);
  workerUrl.pathname = '/pos_test';
  const queued = await state.enqueue(randomUUID());
  const worker = spawn(process.execPath, ['--import', 'tsx', 'apps/worker/src/main.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, WORKER_DATABASE_URL: workerUrl.toString() },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(worker, 'exit');
  let stdout = '';
  worker.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  worker.stderr.on('data', () => {
    /* Never print raw environment/database failures. */
  });
  try {
    const deadline = Date.now() + 10_000;
    let result = await state.txA((tx) => getJob(tx, queued.id));
    while (result?.status !== 'COMPLETED' && Date.now() < deadline && worker.exitCode === null) {
      await setTimeout(100);
      result = await state.txA((tx) => getJob(tx, queued.id));
    }
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result.result?.databaseReachable, true);
    assert.ok(stdout.includes('worker.started'));
    console.info(
      'Worker proces real: pornire, lease, handler PostgreSQL și finalizare confirmate.',
    );
  } finally {
    worker.kill('SIGTERM');
    const graceful = await Promise.race([exited.then(() => true), setTimeout(3000, false)]);
    if (!graceful) {
      worker.kill('SIGKILL');
      await exited;
    }
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
      state.worker.$disconnect(),
    ]);
    assert.equal(graceful, true, 'Workerul trebuie să se oprească grațios.');
    assert.equal(worker.exitCode, 0);
    console.info('Worker proces real: oprire grațioasă confirmată.');
  }
}

await smokeWorkerProcess();
