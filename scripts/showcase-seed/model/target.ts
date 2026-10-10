import type { SeedTarget } from './seed.types';

export function seedTarget(
  env: Readonly<Record<string, string | undefined>>,
  production: boolean,
): SeedTarget {
  if (env.VERCEL || env.CI)
    throw new Error('Seedul se rulează din terminalul privat, niciodată la build/CI.');
  if ((env.NODE_ENV === 'production') !== production)
    throw new Error('Mediul nu corespunde modului explicit al seedului.');
  const origin = new URL(env.TENANT_ORIGIN ?? '');
  if (origin.origin !== env.TENANT_ORIGIN || origin.username || origin.password)
    throw new Error('TENANT_ORIGIN trebuie să fie originea exactă.');
  if (
    production
      ? origin.protocol !== 'https:'
      : origin.protocol !== 'http:' ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
  )
    throw new Error('Originea nu corespunde modului seedului.');
  let target: SeedTarget | undefined;
  for (const [key, role] of [
    ['DATABASE_URL', 'pos_runtime'],
    ['AUTH_DATABASE_URL', 'pos_auth'],
    ['PLATFORM_DATABASE_URL', 'pos_platform'],
  ]) {
    const url = new URL(env[key] ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      decodeURIComponent(url.username) !== role
    )
      throw new Error(`${key}: rol PostgreSQL restrâns incorect.`);
    if (
      production
        ? !url.hostname.endsWith('.neon.tech') ||
          url.hostname.includes('-pooler.') ||
          url.searchParams.get('sslmode') !== 'verify-full'
        : !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/pos_dev'
    )
      throw new Error(`${key}: țintă nepermisă.`);
    const next: SeedTarget = {
      hostname: url.hostname,
      port: url.port,
      database: url.pathname,
      origin: origin.origin,
      mode: production ? 'production' : 'local',
    };
    if (
      target &&
      (target.hostname !== next.hostname ||
        target.port !== next.port ||
        target.database !== next.database)
    )
      throw new Error('Toate rolurile trebuie să indice aceeași bază.');
    target = next;
  }
  return target!;
}

export function assertTarget(actual: SeedTarget, expected: SeedTarget) {
  if (
    actual.hostname !== expected.hostname ||
    actual.port !== expected.port ||
    actual.database !== expected.database ||
    actual.origin !== expected.origin ||
    actual.mode !== expected.mode
  )
    throw new Error('Manifestul aparține altei baze/origini. Nu îl reutilizez.');
}
