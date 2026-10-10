export const SESSION_POLICY = {
  TENANT: { cookieName: 'pos_tenant', path: '/api/tenant', durationMinutes: 480, idleMinutes: 30 },
  PLATFORM: {
    cookieName: 'pos_platform',
    path: '/api/platform',
    durationMinutes: 60,
    idleMinutes: 15,
  },
} as const;
export const CSRF_SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
export const DEFAULT_RATE_LIMIT = 10;
export const RATE_LIMIT_MESSAGE = 'Prea multe încercări. Reîncercați mai târziu.';
