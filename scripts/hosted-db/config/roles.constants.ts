export const hostedRoles = [
  ['pos_migrator', 'MIGRATION_DATABASE_URL'],
  ['pos_runtime', 'DATABASE_URL'],
  ['pos_auth', 'AUTH_DATABASE_URL'],
  ['pos_platform', 'PLATFORM_DATABASE_URL'],
  ['pos_worker', 'WORKER_DATABASE_URL'],
] as const;
