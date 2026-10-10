export const tenantOrigin = process.env.TENANT_ORIGIN ?? 'http://127.0.0.1:3000';
export const platformOrigin = process.env.PLATFORM_ORIGIN ?? 'http://127.0.0.1:3001';
// Both principals share the real 30/minute login-IP bucket. Leave room for manual checks.
export const SYNTHETIC_LOGIN_INTERVAL_MS = 3100;
export const SYNTHETIC_LOGIN_WINDOW_MS = 60_000;
export const isLocal = (address: string) =>
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(address).hostname);
if (![tenantOrigin, platformOrigin].every(isLocal))
  throw new Error('E2E refuză destinații din afara calculatorului.');

export const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
];
