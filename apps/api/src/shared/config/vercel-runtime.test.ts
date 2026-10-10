import { describe, expect, it } from 'vitest';
import { assertVercelApiEnvironment } from './vercel-runtime';

function environment() {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://pos_runtime:synthetic@db.example.com/pos?sslmode=require',
    AUTH_DATABASE_URL: 'postgresql://pos_auth:synthetic@db.example.com/pos?sslmode=require',
    MEDIA_STORAGE: 'vercel-blob',
    BLOB_READ_WRITE_TOKEN: 'synthetic',
  };
}
describe('entrypoint tenant Vercel', () => {
  it('acceptă rolurile distincte, TLS și fotografiile private', () => {
    expect(() => assertVercelApiEnvironment(environment())).not.toThrow();
  });
  it('refuză owner-ul, pooling de tranzacții și TLS absent', () => {
    for (const DATABASE_URL of [
      'postgresql://owner:synthetic@db.example.com/pos?sslmode=require',
      'postgresql://pos_runtime:synthetic@db.example.com/pos',
      'postgresql://pos_runtime:synthetic@ep-name-pooler.neon.tech/pos?sslmode=require',
    ])
      expect(() => assertVercelApiEnvironment({ ...environment(), DATABASE_URL })).toThrow();
  });
  it('refuză publicarea platformei/migrațiilor și filesystemul temporar', () => {
    for (const overrides of [
      { PLATFORM_DATABASE_URL: 'private' },
      { MIGRATION_DATABASE_URL: 'private' },
      { PLATFORM_PRIVATE_READY: 'true' },
      { MEDIA_STORAGE: 'local' },
      { BLOB_READ_WRITE_TOKEN: '' },
    ])
      expect(() => assertVercelApiEnvironment({ ...environment(), ...overrides })).toThrow();
  });
});
