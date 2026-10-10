import { describe, expect, it } from 'vitest';
import { assertVercelEnvironment } from './vercel';
function environment() {
  return { VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'pos-project.vercel.app' };
}
describe('frontendul din proiectul Vercel comun', () => {
  it('acceptă domeniul generic fără VPS, binding sau secrete la build', () => {
    expect(() => assertVercelEnvironment(environment())).not.toThrow();
    expect(() =>
      assertVercelEnvironment({ ...environment(), DATABASE_URL: 'server-only' }),
    ).not.toThrow();
  });
  it('refuză origini nesigure și credențiale în URL', () => {
    for (const TENANT_ORIGIN of [
      'invalid',
      'http://pos.example.com',
      'https://127.0.0.1',
      'https://api.internal',
      'https://pos.example.invalid',
      'https://user:secret@pos.example.com',
      'https://pos.example.com/api',
      'https://pos.example.com?token=secret',
    ])
      expect(() => assertVercelEnvironment({ ...environment(), TENANT_ORIGIN })).toThrow();
  });
  it('refuză gazda și portul realtime care pierd cookie-ul host-only', () => {
    for (const TENANT_REALTIME_URL of [
      'wss://api.example.com/api/tenant/realtime',
      'wss://pos-project.vercel.app:8443/api/tenant/realtime',
    ])
      expect(() => assertVercelEnvironment({ ...environment(), TENANT_REALTIME_URL })).toThrow();
  });
  it('refuză credențialele administrative și secretele publicate în browser', () => {
    for (const name of [
      'PLATFORM_DATABASE_URL',
      'MIGRATION_DATABASE_URL',
      'NEXT_PUBLIC_DATABASE_URL',
      'NEXT_PUBLIC_BLOB_READ_WRITE_TOKEN',
      'NEXT_PUBLIC_CSRF_SECRET',
    ])
      expect(() => assertVercelEnvironment({ ...environment(), [name]: 'private' })).toThrow();
  });
  it('refuză un build fără origine configurată', () => {
    expect(() => assertVercelEnvironment({ VERCEL: '1' })).toThrow();
  });
});
