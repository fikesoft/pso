import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const test = process.argv.includes('--test');
if (!process.env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL lipsește');
const url = new URL(process.env.MIGRATION_DATABASE_URL);
if (test) {
  if (process.env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost'].includes(url.hostname))
    throw new Error('Migrațiile de test cer un mediu local');
  url.pathname = '/pos_test';
}
const result = spawnSync(
  process.execPath,
  [resolve('packages/db/node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
  {
    cwd: resolve('packages/db'),
    env: { ...process.env, MIGRATION_DATABASE_URL: url.toString() },
    stdio: 'inherit',
  },
);
process.exit(result.status ?? 1);
