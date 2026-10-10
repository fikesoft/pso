import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createDatabaseClient, assertRuntimeDatabaseRole } from '../../packages/db/src/index';
import { provisionHostedRoles } from '../../scripts/hosted-db/model/provision';
import { hostedRoles } from '../../scripts/hosted-db/config/roles.constants';

const connection = process.env.HOSTED_PROBE_DATABASE_URL;
if (
  !connection ||
  process.env.NODE_ENV === 'production' ||
  new URL(connection).hostname !== '127.0.0.1' ||
  new URL(connection).port !== '55448'
)
  throw new Error('Proba provisioningului cere clusterul local separat pe 55448.');
const admin = createDatabaseClient(connection, 1);
const passwords = Object.fromEntries(
  hostedRoles.map(([role]) => [role, randomBytes(32).toString('hex')]),
);
const urls = Object.fromEntries(
  hostedRoles.map(([role, key]) => {
    const url = new URL(connection);
    url.username = role;
    url.password = passwords[role];
    return [key, url.toString()];
  }),
);
try {
  await provisionHostedRoles(admin, passwords);
  const result = spawnSync(
    process.execPath,
    [resolve('packages/db/node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: resolve('packages/db'),
      env: { ...process.env, MIGRATION_DATABASE_URL: urls.MIGRATION_DATABASE_URL },
      encoding: 'utf8',
    },
  );
  await writeFile('.local/vercel-provision-migrations.log', result.stdout + result.stderr, {
    mode: 0o600,
  });
  if (result.status !== 0) throw new Error('Migrarea clusterului de probă a eșuat.');
  const runtime = createDatabaseClient(urls.DATABASE_URL, 1);
  try {
    await assertRuntimeDatabaseRole(runtime);
    const rows = await runtime.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) FROM "CompanyUser"`;
    if (rows[0]?.count !== 0n) throw new Error('RLS fără context nu este închis.');
  } finally {
    await runtime.$disconnect();
  }
  let refused = false;
  try {
    await provisionHostedRoles(admin, passwords);
  } catch {
    refused = true;
  }
  if (!refused) throw new Error('Reprovisioningul trebuie refuzat.');
  console.log(
    'PASS: provisioning, migrații complete, runtime nonowner/RLS și refuzul reprovisioningului pe cluster local separat.',
  );
} finally {
  await admin.$disconnect();
}
