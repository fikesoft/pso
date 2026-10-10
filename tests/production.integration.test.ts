import { execFileSync, spawnSync } from 'node:child_process';
import { test, expect } from 'vitest';
const environment = {
  ...process.env,
  NODE_ENV: 'production',
  TENANT_ORIGIN: 'https://tenant.example.invalid',
  PLATFORM_ORIGIN: 'https://private.example.invalid',
  PLATFORM_PRIVATE_READY: 'false',
  MFA_ENCRYPTION_KEY: 'a'.repeat(64),
  CSRF_SECRET: 'b'.repeat(64),
};
test('production emits Secure host-only cookies and fails closed without private configuration', () => {
  const output = execFileSync(
    process.execPath,
    ['--import', 'tsx', 'tests/fixtures/production-probe.ts'],
    { env: environment, encoding: 'utf8' },
  );
  const result = JSON.parse(output.trim());
  expect(result.privateBlocked).toBe(true);
  expect(result.status).toBe(200);
  expect(result.cookieFlags[0]).toEqual(
    expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/tenant']),
  );
  expect(result.cookieFlags[0].some((flag: string) => /^Domain=/i.test(flag))).toBe(false);
});
test('seed refuses production before creating any identity', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'apps/api/src/seed.ts'], {
    env: environment,
    encoding: 'utf8',
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Seedul este interzis în producție');
});
