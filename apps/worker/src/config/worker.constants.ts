export const WORKER_OPTIONS = {
  pollMilliseconds: 1000,
  maintenanceKind: 'maintenance.database_health',
  cronMaxJobs: 3,
  cronBudgetMilliseconds: 20_000,
} as const;
