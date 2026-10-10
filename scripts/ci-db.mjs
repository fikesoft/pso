/** Bootstrap a FRESH, loopback-only PostgreSQL service for CI or local Docker.
 * No reset, deletion, default app password, or external connection is performed.
 * Usage: PGPASSWORD=<owner password> PGUSER=pos_local_owner node scripts/ci-db.mjs
 * Optional PGPORT (default55432), CI_ENV_FILE (default.env). Run after pnpm install.
 * Existing config/databases/application roles cause a refusal instead of rotation.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

if (process.argv.includes('--help')) {
  console.log(
    'Bază PostgreSQL NOUĂ pe loopback; PGUSER și PGPASSWORD obligatorii. PGPORT=55432, CI_ENV_FILE=.env. Configurează rolurile, pos_dev/pos_test, apoi aplică migrațiile fără reset. Refuză date/configurații existente.',
  );
  process.exit(0);
}
const root = process.cwd();
const envFile = resolve(process.env.CI_ENV_FILE ?? '.env');
const host = process.env.PGHOST ?? '127.0.0.1';
const port = process.env.PGPORT ?? '55432';
const owner = process.env.PGUSER;
const password = process.env.PGPASSWORD;
if (process.env.NODE_ENV === 'production')
  throw new Error('Bootstrapul CI/local refuză mediul de producție.');
if (!['127.0.0.1', 'localhost', '::1'].includes(host))
  throw new Error('Bootstrapul acceptă exclusiv PostgreSQL pe loopback.');
if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error('PGPORT nevalid.');
if (!owner || !/^[a-z][a-z0-9_]{2,62}$/.test(owner) || !password || password.length < 12)
  throw new Error('PGUSER valid și PGPASSWORD de minimum 12 caractere sunt obligatorii.');
if (existsSync(envFile))
  throw new Error('Fișierul env există deja; nu suprascriem sau rotim credențiale existente.');
if (!envFile.startsWith(root + '/'))
  throw new Error('Fișierul env trebuie să rămână în directorul proiectului.');
if (!existsSync('packages/db/node_modules/prisma/build/index.js'))
  throw new Error('Instalați dependențele cu pnpm install --frozen-lockfile înainte.');
const dbEnv = {
  ...process.env,
  PGHOST: host,
  PGPORT: port,
  PGUSER: owner,
  PGPASSWORD: password,
  PGCONNECT_TIMEOUT: '5',
};
function psql(sql, database = 'postgres') {
  const result = spawnSync('psql', ['-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', database], {
    input: sql,
    env: dbEnv,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    // SQL may contain generated credentials. Never emit raw SQL, process env, or stdout/stderr.
    throw new Error(
      `Operațiunea PostgreSQL locală a eșuat (cod ${result.status ?? 'indisponibil'}). Verificați serviciul/psql și credențialele proprietarului.`,
    );
  }
  return result.stdout.trim();
}
const occupied = psql(
  `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname IN ('pos_dev','pos_test')) OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('pos_migrator','pos_runtime','pos_auth','pos_platform','pos_worker','pos_internal'));`,
);
if (occupied !== 'f')
  throw new Error(
    'Serviciul conține deja bazele sau rolurile POS. Folosiți conexiunile existente și migrate deploy; nu se face reset sau rotație implicită.',
  );
psql(readFileSync('packages/db/scripts/roles.sql', 'utf8'));
const appEnv = {
  NODE_ENV: 'development',
  TENANT_ORIGIN: 'http://127.0.0.1:3000',
  PLATFORM_ORIGIN: 'http://127.0.0.1:3001',
  API_BIND_HOST: '127.0.0.1',
  PLATFORM_BIND_HOST: '127.0.0.1',
  PLATFORM_PRIVATE_READY: 'false',
  MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  CSRF_SECRET: randomBytes(48).toString('hex'),
};
for (const [role, key] of [
  ['pos_migrator', 'MIGRATION_DATABASE_URL'],
  ['pos_runtime', 'DATABASE_URL'],
  ['pos_auth', 'AUTH_DATABASE_URL'],
  ['pos_platform', 'PLATFORM_DATABASE_URL'],
  ['pos_worker', 'WORKER_DATABASE_URL'],
]) {
  const secret = randomBytes(32).toString('hex');
  psql(`ALTER ROLE ${role} PASSWORD '${secret}';`);
  const url = new URL(`postgresql://${host.includes(':') ? `[${host}]` : host}:${port}/pos_dev`);
  url.username = role;
  url.password = secret;
  appEnv[key] = url.toString();
}
psql('CREATE DATABASE pos_dev OWNER pos_migrator;');
psql('CREATE DATABASE pos_test OWNER pos_migrator;');
for (const database of ['pos_dev', 'pos_test'])
  psql('ALTER SCHEMA public OWNER TO pos_migrator;', database);
appEnv.TEST_DATABASE_URL = appEnv.DATABASE_URL.replace('/pos_dev', '/pos_test');
mkdirSync(dirname(envFile), { recursive: true, mode: 0o700 });
writeFileSync(
  envFile,
  Object.entries(appEnv)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n',
  { mode: 0o600, flag: 'wx' },
);
for (const database of ['pos_dev', 'pos_test']) {
  const result = spawnSync(
    process.execPath,
    [resolve('packages/db/node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: resolve('packages/db'),
      env: {
        ...process.env,
        ...appEnv,
        MIGRATION_DATABASE_URL: appEnv.MIGRATION_DATABASE_URL.replace('/pos_dev', `/${database}`),
      },
      stdio: 'inherit',
    },
  );
  if (result.status !== 0)
    throw new Error(
      `Migrația ${database} a eșuat. Configurația a fost păstrată; reluați migrate deploy cu fișierul env creat.`,
    );
}
console.log(
  'Bootstrap local finalizat: pos_dev și pos_test, roluri distincte, migrații aplicate. Credențialele generate rămân în fișierul env privat; nicio parolă de aplicație nu este implicită.',
);
