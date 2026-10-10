import type { PrismaClient, TenantTransaction } from '@pos/db';
import { JOB_OPTIONS } from '../config/jobs.constants';
import type { ClaimedJobRow, EnqueueJobInput, JobRow, ChangeRow } from './jobs.types';

/** Call inside the same tenant transaction as the event that requires this job. */
export async function enqueueJob(tx: TenantTransaction, input: EnqueueJobInput) {
  const rows = await tx.$queryRaw<JobRow[]>`
    SELECT pos_jobs.enqueue(${input.organizationId}::uuid,${input.kind},${input.idempotencyKey},
      ${JSON.stringify(input.payload)}::jsonb,${input.maxAttempts ?? JOB_OPTIONS.maxAttempts}::integer,
      ${input.scheduledAt ?? null}::timestamptz) AS job`;
  if (!rows[0]) throw new Error('Înregistrarea sarcinii nu a întors rezultatul.');
  return rows[0].job;
}

/** Dedicated worker connection only; database ACL rejects tenant runtime callers. */
export async function claimJobs(
  client: PrismaClient,
  workerId: string,
  batchSize: number = JOB_OPTIONS.batchSize,
  leaseSeconds: number = JOB_OPTIONS.leaseSeconds,
) {
  const rows = await client.$queryRaw<ClaimedJobRow[]>`
    SELECT job FROM pos_jobs.claim(${workerId}::uuid,${batchSize}::integer,${leaseSeconds}::integer) AS job`;
  return rows.map((row) => row.job);
}

/** False means the lease expired or was replaced. Never commit effects after false. */
export async function completeJob(
  tx: TenantTransaction,
  organizationId: string,
  jobId: string,
  leaseToken: string,
  result: EnqueueJobInput['payload'],
) {
  const rows = await tx.$queryRaw<ChangeRow[]>`
    SELECT pos_jobs.complete(${organizationId}::uuid,${jobId}::uuid,${leaseToken}::uuid,
      ${JSON.stringify(result)}::jsonb) AS changed`;
  return rows[0]?.changed === true;
}

export async function failJob(
  tx: TenantTransaction,
  organizationId: string,
  jobId: string,
  leaseToken: string,
  errorCode: string,
) {
  const rows = await tx.$queryRaw<ChangeRow[]>`
    SELECT pos_jobs.fail(${organizationId}::uuid,${jobId}::uuid,${leaseToken}::uuid,${errorCode}) AS changed`;
  return rows[0]?.changed === true;
}

export async function getJob(tx: TenantTransaction, jobId: string) {
  const rows = await tx.$queryRaw<JobRow[]>`
    SELECT to_jsonb(j)-ARRAY['leaseToken','workerId'] AS job
    FROM public."BackgroundJob" j WHERE id=${jobId}::uuid`;
  return rows[0]?.job ?? null;
}
