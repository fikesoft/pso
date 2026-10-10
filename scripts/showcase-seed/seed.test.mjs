import { describe, expect, it } from 'vitest';
import { seedTarget, assertTarget } from './model/target';
import { createSeedRecord, parseSeedRecord, seedKey } from './model/record';
import { SHOWCASE_MENU } from './config/menu.constants';
import { SeedHttpClient } from './model/http-client';
import { seedManifest } from './model/manifest';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function environment(production = false) {
  const host = production ? 'seed-example.neon.tech' : '127.0.0.1:55432';
  const database = production ? 'pos' : 'pos_dev';
  const tls = production ? '?sslmode=verify-full' : '';
  return {
    NODE_ENV: production ? 'production' : 'development',
    TENANT_ORIGIN: production ? 'https://pos.example.invalid' : 'http://127.0.0.1:3000',
    DATABASE_URL: `postgresql://pos_runtime:synthetic@${host}/${database}${tls}`,
    AUTH_DATABASE_URL: `postgresql://pos_auth:synthetic@${host}/${database}${tls}`,
    PLATFORM_DATABASE_URL: `postgresql://pos_platform:synthetic@${host}/${database}${tls}`,
  };
}
describe('showcase seed target and private record', () => {
  it('requires an explicit mode, same database, restricted roles and TLS', () => {
    expect(seedTarget(environment(), false).mode).toBe('local');
    expect(seedTarget(environment(true), true).mode).toBe('production');
    for (const env of [
      { ...environment(), NODE_ENV: 'production' },
      { ...environment(), CI: '1' },
      { ...environment(), VERCEL: '1' },
      {
        ...environment(),
        AUTH_DATABASE_URL: environment().AUTH_DATABASE_URL.replace('pos_dev', 'pos_test'),
      },
      {
        ...environment(),
        AUTH_DATABASE_URL: environment().AUTH_DATABASE_URL.replace('55432', '55433'),
      },
      {
        ...environment(),
        DATABASE_URL: environment().DATABASE_URL.replace('pos_runtime', 'pos_migrator'),
      },
      {
        ...environment(),
        DATABASE_URL: environment().DATABASE_URL.replace('127.0.0.1', 'remote.example.invalid'),
      },
    ])
      expect(() => seedTarget(env, false)).toThrow();
    for (const env of [
      {
        ...environment(true),
        DATABASE_URL: environment(true).DATABASE_URL.replace('verify-full', 'require'),
      },
      {
        ...environment(true),
        DATABASE_URL: environment(true).DATABASE_URL.replace(
          'seed-example.neon',
          'seed-example-pooler.neon',
        ),
      },
      { ...environment(true), TENANT_ORIGIN: 'https://pos.example.invalid/path' },
    ])
      expect(() => seedTarget(env, true)).toThrow();
    expect(() => seedTarget(environment(true), false)).toThrow();
  });
  it('binds secrets to one target and validates the complete recovery record', () => {
    const target = seedTarget(environment(), false);
    const record = createSeedRecord(target);
    expect(parseSeedRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(record.companies.map((c) => c.slug)).toEqual(['companie-plina', 'companie-goala']);
    expect(record.users).toHaveLength(24);
    expect(new Set(record.users.map((u) => u.secret)).size).toBe(24);
    expect(createSeedRecord(target).platform.password).not.toBe(record.platform.password);
    expect(seedKey(record, 'order:1')).toBe(seedKey(record, 'order:1'));
    expect(seedKey(record, 'order:1')).not.toBe(seedKey(record, 'order:2'));
    expect(() => assertTarget(record.target, { ...target, database: '/another' })).toThrow();
    for (const edit of [
      (r) => {
        r.users.pop();
      },
      (r) => {
        r.users[1].id = r.users[2].id;
      },
      (r) => {
        r.users[1].secret = '123';
      },
      (r) => {
        r.companies[1].slug = 'companie-plina';
      },
      (r) => {
        r.users[0].profile = 1;
      },
    ]) {
      const invalid = JSON.parse(JSON.stringify(record));
      edit(invalid);
      expect(() => parseSeedRecord(invalid)).toThrow();
    }
  });
  it('keeps menu provenance explicit and synthetic clients on loopback', () => {
    expect(SHOWCASE_MENU).toHaveLength(42);
    expect(new Set(SHOWCASE_MENU.map((p) => p.sku)).size).toBe(42);
    expect(
      SHOWCASE_MENU.filter((p) => p.sku.startsWith('SHOWCASE-')).every((p) => p.synthetic),
    ).toBe(true);
    expect(
      () => new SeedHttpClient('https://pos.example.invalid', 'https://pos.example.invalid'),
    ).toThrow();
    expect(
      () => new SeedHttpClient('http://127.0.0.1:4000', 'http://127.0.0.1:3000'),
    ).not.toThrow();
  });
  it('stores private credentials before provisioning and atomically recovers a finished manifest', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pos-showcase-manifest-'));
    try {
      const target = seedTarget(environment(), false);
      const first = await seedManifest(target, directory);
      expect(first.finished).toBe(false);
      expect((await stat(`${first.path}.pending`)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(`${first.path}.pending`, 'utf8')).platform.password).toBe(
        first.record.platform.password,
      );
      const recovered = await seedManifest(target, directory);
      expect(recovered.record).toEqual(first.record);
      await expect(seedManifest({ ...target, hostname: 'another' }, directory)).rejects.toThrow(
        'Manifestul',
      );
      await recovered.complete();
      const finished = await seedManifest(target, directory);
      expect(finished.finished).toBe(true);
      expect(finished.record).toEqual(first.record);
      expect((await stat(finished.path)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
