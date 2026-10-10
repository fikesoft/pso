import { withTenantTransaction } from '@pos/db';
import type { PrismaClient } from '@pos/db';
import { completeJob, failJob } from '@pos/jobs';
import type { ClaimedJob } from '@pos/jobs';
import { WORKER_OPTIONS } from '../config/worker.constants';
import type { DatabaseHealthRow } from './worker.types';

export async function processJob(client: PrismaClient, job: ClaimedJob) {
  try {
    return await withTenantTransaction(
      client,
      { organizationId: job.organizationId },
      async (tx) => {
        if (job.kind !== WORKER_OPTIONS.maintenanceKind) {
          return failJob(tx, job.organizationId, job.id, job.leaseToken, 'UNSUPPORTED_HANDLER');
        }
        // A real database round trip and context verification; no simulated report/integration.
        const rows = await tx.$queryRaw<DatabaseHealthRow[]>`
        SELECT clock_timestamp() AS "checkedAt",current_setting('app.organization_id') AS "organizationId"`;
        const health = rows[0];
        if (!health || health.organizationId !== job.organizationId)
          throw new Error('Invalid context');
        const completed = await completeJob(tx, job.organizationId, job.id, job.leaseToken, {
          checkedAt: health.checkedAt.toISOString(),
          databaseReachable: true,
        });
        if (!completed) throw new Error('Stale lease');
        return true;
      },
    );
  } catch {
    return withTenantTransaction(client, { organizationId: job.organizationId }, (tx) =>
      failJob(tx, job.organizationId, job.id, job.leaseToken, 'HANDLER_FAILED'),
    );
  }
}
