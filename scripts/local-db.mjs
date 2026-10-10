import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const root = process.cwd();
const local = resolve('.local');
const data = resolve('.local/pgdata');
const socket = resolve('.local/pgsocket');
mkdirSync(local, { recursive: true, mode: 0o700 });
mkdirSync(socket, { recursive: true, mode: 0o700 });
function run(cmd, args, input) {
  const result = spawnSync(cmd, args, { input, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${cmd}: ${result.stderr || result.stdout}`);
  return result.stdout;
}
let env = {};
if (existsSync('.env')) {
  env = Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}
if (!existsSync(data + '/PG_VERSION'))
  run('initdb', [
    '-D',
    data,
    '--auth-local=trust',
    '--auth-host=scram-sha-256',
    '--username=pos_local_owner',
    '--encoding=UTF8',
    '--no-locale',
  ]);
const running = spawnSync('pg_ctl', ['-D', data, 'status'], { encoding: 'utf8' }).status === 0;
if (!running)
  run('pg_ctl', [
    '-D',
    data,
    '-l',
    resolve('.local/postgres.log'),
    '-o',
    `-h 127.0.0.1 -p 55432 -k ${socket}`,
    '-w',
    'start',
  ]);
const psql = (sql, db = 'postgres') =>
  run(
    'psql',
    [
      '-h',
      socket,
      '-p',
      '55432',
      '-U',
      'pos_local_owner',
      '-d',
      db,
      '-v',
      'ON_ERROR_STOP=1',
      '-X',
      '-q',
    ],
    sql,
  );
psql(readFileSync('packages/db/scripts/roles.sql', 'utf8'));
for (const [role, key] of [
  ['pos_migrator', 'MIGRATION_DATABASE_URL'],
  ['pos_runtime', 'DATABASE_URL'],
  ['pos_auth', 'AUTH_DATABASE_URL'],
  ['pos_platform', 'PLATFORM_DATABASE_URL'],
  ['pos_worker', 'WORKER_DATABASE_URL'],
]) {
  if (!env[key]) {
    const password = randomBytes(24).toString('hex');
    psql(`ALTER ROLE ${role} PASSWORD '${password}';`);
    env[key] = `postgresql://${role}:${password}@127.0.0.1:55432/pos_dev`;
  }
}
const dbNames = run('psql', [
  '-h',
  socket,
  '-p',
  '55432',
  '-U',
  'pos_local_owner',
  '-d',
  'postgres',
  '-X',
  '-tAc',
  'SELECT datname FROM pg_database',
]);
for (const db of ['pos_dev', 'pos_test'])
  if (!dbNames.split('\n').includes(db)) psql(`CREATE DATABASE ${db} OWNER pos_migrator;`);
for (const db of ['pos_dev', 'pos_test'])
  psql(
    'ALTER SCHEMA public OWNER TO pos_migrator; REVOKE CREATE ON SCHEMA public FROM PUBLIC;',
    db,
  );
env = {
  NODE_ENV: 'development',
  TENANT_ORIGIN: 'http://127.0.0.1:3000',
  PLATFORM_ORIGIN: 'http://127.0.0.1:3001',
  PLATFORM_PRIVATE_READY: 'false',
  MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  CSRF_SECRET: randomBytes(48).toString('hex'),
  ...env,
};
if (!env.TEST_DATABASE_URL)
  env.TEST_DATABASE_URL = env.DATABASE_URL.replace('/pos_dev', '/pos_test');
writeFileSync(
  '.env',
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n',
  { mode: 0o600 },
);
console.log(
  `PostgreSQL local pregătit pe 127.0.0.1:55432, date în ${data}. Configurația privată: ${root}/.env`,
);
