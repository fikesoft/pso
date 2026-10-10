import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '@pos/db';
import { assertWorkerDatabaseRole, claimJobs } from '@pos/jobs';
import { WORKER_OPTIONS } from '../config/worker.constants';
import { processJob } from './process-job';

export async function runWorkerBatch() {
  const connection = process.env.WORKER_DATABASE_URL;
  if (!connection) throw new Error('WORKER_DATABASE_URL lipsește.');
  const client = createDatabaseClient(connection, 1);
  const workerId = randomUUID();
  const deadline = Date.now() + WORKER_OPTIONS.cronBudgetMilliseconds;
  let attempted = 0;
  let completed = 0;
  try {
    await assertWorkerDatabaseRole(client);
    while (attempted < WORKER_OPTIONS.cronMaxJobs && Date.now() < deadline) {
      const [job] = await claimJobs(client, workerId, 1);
      if (!job) break;
      attempted++;
      if (await processJob(client, job)) completed++;
    }
    return { attempted, completed };
  } finally {
    await client.$disconnect();
  }
}
