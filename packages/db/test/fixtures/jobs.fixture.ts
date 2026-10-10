import assert from 'node:assert/strict';
import { createDatabaseClient, withTenantTransaction } from '../../src/index';
import { assertWorkerDatabaseRole, enqueueJob } from '../../../jobs/src/index';
import { createSecurityFixture } from './security.fixture';

export async function createJobsFixture() {
  const state = await createSecurityFixture();
  const source = process.env.TEST_WORKER_DATABASE_URL ?? process.env.WORKER_DATABASE_URL;
  assert.ok(source, 'WORKER_DATABASE_URL este necesar pentru probele cozii.');
  const url = new URL(source);
  url.pathname = '/pos_test';
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  const worker = createDatabaseClient(url.toString(), 2);
  await assertWorkerDatabaseRole(worker);
  const workerTx = <T>(
    organizationId: string,
    fn: Parameters<typeof withTenantTransaction<T>>[2],
  ) => withTenantTransaction(worker, { organizationId }, fn);
  const enqueue = (key: string, maxAttempts = 3) =>
    state.txA((tx) =>
      enqueueJob(tx, {
        organizationId: state.a.organization.id,
        kind: 'maintenance.database_health',
        idempotencyKey: key,
        payload: { synthetic: true },
        maxAttempts,
      }),
    );
  return { ...state, worker, workerTx, enqueue };
}
