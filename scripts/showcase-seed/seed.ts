import { open, rm } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type * as ApiDatabase from '../../apps/api/src/db';
import { createDatabaseClient, assertRuntimeDatabaseRole } from '../../packages/db/src/index';
import { seedTarget } from './model/target';
import { seedManifest } from './model/manifest';

async function seed() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--production')) throw new Error('Argument de seed necunoscut.');
  const target = seedTarget(process.env, args.includes('--production'));
  await mkdir('.local', { recursive: true, mode: 0o700 });
  const lockPath = `.local/showcase-${target.mode}.lock`;
  const lock = await open(lockPath, 'wx', 0o600);
  const platformUrl = process.env.PLATFORM_DATABASE_URL!;
  // Public API imports must receive only tenant credentials, even for this private process.
  for (const key of [
    'PLATFORM_DATABASE_URL',
    'MIGRATION_DATABASE_URL',
    'PRIVATE_PLATFORM_MFA_KEY',
    'PRIVATE_PLATFORM_CSRF_SECRET',
  ])
    delete process.env[key];
  const clients = {
    runtime: createDatabaseClient(process.env.DATABASE_URL!, 2),
    auth: createDatabaseClient(process.env.AUTH_DATABASE_URL!, 2),
    platform: createDatabaseClient(platformUrl, 1),
  };
  let server: Server | undefined;
  let apiDatabase: typeof ApiDatabase | undefined;
  try {
    await assertRuntimeDatabaseRole(clients.runtime);
    for (const [client, role] of [
      [clients.auth, 'pos_auth'],
      [clients.platform, 'pos_platform'],
    ] as const) {
      const [row] = await client.$queryRaw<Array<{ name: string; unsafe: boolean }>>`
        SELECT current_user AS name, (rolsuper OR rolbypassrls) AS unsafe FROM pg_roles WHERE rolname=current_user`;
      if (row?.name !== role || row.unsafe) throw new Error('Rol DB de seed nepermis.');
    }
    const manifest = await seedManifest(target);
    const { verifyShowcaseSeed } = await import('./model/verify');
    if (!manifest.finished) {
      const { createApp } = await import('../../apps/api/src/server');
      apiDatabase = await import('../../apps/api/src/db');
      server = await new Promise<Server>((resolve, reject) => {
        const running = createApp('TENANT').listen(0, '127.0.0.1', () => resolve(running));
        running.once('error', reject);
      });
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const { runShowcaseSeed } = await import('./model/run');
      await runShowcaseSeed(clients, manifest.record, base);
    }
    await verifyShowcaseSeed(clients, manifest.record);
    await manifest.complete();
    console.log(
      manifest.finished
        ? 'Seedul este deja complet; datele și credențialele au fost păstrate.'
        : 'Seed complet: 2 companii, 3 locații, 42 produse, 24 lucrători, 36 clienți, 72 adrese și 156 comenzi sintetice.',
    );
    console.log(
      `Credențialele sunt numai în fișierul privat ${manifest.path}. Administratori: parolă temporară + MFA obligatorii.`,
    );
    for (const company of manifest.record.companies)
      console.log(`${company.slug}: ${target.origin}/c/${company.slug}/login`);
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve())),
      );
    }
    await Promise.all([
      clients.runtime.$disconnect(),
      clients.auth.$disconnect(),
      clients.platform.$disconnect(),
      ...(apiDatabase
        ? [apiDatabase.runtime.$disconnect(), apiDatabase.bootstrapDb.$disconnect()]
        : []),
    ]);
    await lock.close();
    await rm(lockPath);
  }
}

try {
  await seed();
} catch (error) {
  console.error(
    error instanceof Error &&
      /^(Seed API:|Comandă DEMO|Manifestul|Seedul|Contul|Compania|O companie|Un lucrător|Un produs|Comenzile|Configurarea|Rol DB|Toate rolurile|Mediul|TENANT_ORIGIN|Originea|Argument)/.test(
        error.message,
      )
      ? error.message
      : 'Seedul nu a fost finalizat. Verificați ținta, conflictele și manifestul pending; nu ștergeți datele sau manifestul.',
  );
  process.exitCode = 1;
}
