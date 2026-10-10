export const JOB_OPTIONS = {
  maxAttempts: 5,
  leaseSeconds: 30,
  batchSize: 1,
  workerRole: 'pos_worker',
} as const;
