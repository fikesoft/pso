import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { createDatabaseClient } from '@pos/db';
import { assertWorkerDatabaseRole, claimJobs } from '@pos/jobs';
import { WORKER_OPTIONS } from './config/worker.constants';
import { processJob } from './model/process-job';

async function runWorker() {
  const connection = process.env.WORKER_DATABASE_URL;
  if (!connection) throw new Error('WORKER_DATABASE_URL lipsește.');
  const client = createDatabaseClient(connection, 1);
  const workerId = randomUUID();
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });

  try {
    await assertWorkerDatabaseRole(client);
    console.info(JSON.stringify({ event: 'worker.started', workerId }));
    while (!stopping) {
      try {
        const jobs = await claimJobs(client, workerId);
        for (const job of jobs) {
          const accepted = await processJob(client, job);
          console.info(JSON.stringify({ event: 'worker.attempt', jobId: job.id, accepted }));
        }
        if (jobs.length === 0) await setTimeout(WORKER_OPTIONS.pollMilliseconds);
      } catch {
        // Database errors may contain payloads; log only a fixed safe event.
        console.error(JSON.stringify({ event: 'worker.database_unavailable' }));
        await setTimeout(WORKER_OPTIONS.pollMilliseconds);
      }
    }
  } finally {
    await client.$disconnect();
  }
}

await runWorker();
