import type { Prisma } from '@pos/db';

export type JobPayload = Prisma.InputJsonObject;
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'DEAD';
export interface BackgroundJob {
  id: string;
  organizationId: string;
  kind: string;
  idempotencyKey: string;
  requestHash: string;
  payload: JobPayload;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  leaseUntil: string | null;
  lastErrorCode: string | null;
  result: JobPayload | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}
export interface ClaimedJob extends BackgroundJob {
  leaseToken: string;
  workerId: string;
}
export interface EnqueueJobInput {
  organizationId: string;
  kind: string;
  idempotencyKey: string;
  payload: JobPayload;
  maxAttempts?: number;
  scheduledAt?: Date;
}
export interface JobRow {
  job: BackgroundJob;
}
export interface ClaimedJobRow {
  job: ClaimedJob;
}
export interface ChangeRow {
  changed: boolean;
}
export interface WorkerRole {
  role: string;
  elevated: boolean;
  owns: boolean;
  canCreate: boolean;
  runtimeMember: boolean;
  internalMember: boolean;
}
