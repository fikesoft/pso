import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, access } from 'node:fs/promises';
import { parse } from 'dotenv';
import { createDatabaseClient } from '../../packages/db/src/index';
import { hostedRoles } from './config/roles.constants';
import { provisionHostedRoles } from './model/provision';

async function configure() {
  const connection = process.env.NEON_ADMIN_DATABASE_URL;
  if (!connection) throw new Error('NEON_ADMIN_DATABASE_URL lipsește.');
  const url = new URL(connection);
  if (
    !url.hostname.endsWith('.neon.tech') ||
    url.hostname.includes('-pooler.') ||
    !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')
  )
    throw new Error('Folosiți URL-ul Neon direct, cu TLS, pentru un proiect nou.');
  const destination = '.local/vercel-db.env';
  const pending = '.local/vercel-db.pending.env';
  try {
    await access(destination);
    console.log(
      'Configurarea privată există deja în .local/vercel-db.env; nu se resetează roluri sau parole.',
    );
    return;
  } catch {
    /* A first installation creates credentials locally before the transaction. */
  }
  await mkdir('.local', { recursive: true, mode: 0o700 });
  let values: Record<string, string>;
  try {
    values = parse(await readFile(pending));
  } catch {
    values = {};
    for (const [role, variable] of hostedRoles) {
      const roleUrl = new URL(connection);
      roleUrl.username = role;
      roleUrl.password = randomBytes(32).toString('hex');
      roleUrl.searchParams.delete('channel_binding');
      values[variable] = roleUrl.toString();
    }
    values.MFA_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    values.CSRF_SECRET = randomBytes(48).toString('hex');
    values.CRON_SECRET = randomBytes(32).toString('hex');
    values.MEDIA_STORAGE = 'vercel-blob';
    values.PRIVATE_PLATFORM_MFA_KEY = randomBytes(32).toString('hex');
    values.PRIVATE_PLATFORM_CSRF_SECRET = randomBytes(48).toString('hex');
    await writeFile(
      pending,
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  }
  const passwords = Object.fromEntries(
    hostedRoles.map(([role, variable]) => [
      role,
      decodeURIComponent(new URL(values[variable]).password),
    ]),
  );
  for (const [, variable] of hostedRoles) {
    const configured = new URL(values[variable]);
    if (configured.hostname !== url.hostname || configured.pathname !== url.pathname)
      throw new Error('Configurația pending aparține altei baze; nu este suprascrisă.');
  }
  const platformPath = '.local/vercel-platform.env';
  const platformContents =
    [
      'NODE_ENV=development',
      'PLATFORM_ORIGIN=http://127.0.0.1:3001',
      'PLATFORM_API_URL=http://127.0.0.1:4001',
      'TENANT_ORIGIN=https://POS_PROJECT.vercel.app',
      `PLATFORM_DATABASE_URL=${values.PLATFORM_DATABASE_URL}`,
      `MFA_ENCRYPTION_KEY=${values.PRIVATE_PLATFORM_MFA_KEY}`,
      `CSRF_SECRET=${values.PRIVATE_PLATFORM_CSRF_SECRET}`,
    ].join('\n') + '\n';
  let previous: string | undefined;
  try {
    previous = await readFile(platformPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (previous !== undefined && previous !== platformContents)
    throw new Error('Fișierul platformei există cu altă configurare; nu este suprascris.');
  if (previous === undefined)
    await writeFile(platformPath, platformContents, { flag: 'wx', mode: 0o600 });
  const admin = createDatabaseClient(connection, 1);
  try {
    await provisionHostedRoles(admin, passwords);
  } finally {
    await admin.$disconnect();
  }
  await rename(pending, destination);
  console.log(
    'Rolurile sunt create. Configurația privată este în .local/vercel-db.env (0600). Nu o publicați integral în Vercel.',
  );
}

try {
  await configure();
} catch {
  console.error(
    'Configurarea nu a fost finalizată. Verificați URL-ul administrativ Neon direct și o bază goală într-un proiect nou. Fișierul pending se păstrează pentru reluare; nu sunt resetate date existente.',
  );
  process.exitCode = 1;
}
