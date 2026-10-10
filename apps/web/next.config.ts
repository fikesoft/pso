import type { NextConfig } from 'next';
import { resolve } from 'node:path';
import { realtimeUrl } from '@pos/contracts/realtime';
import { tenantDeploymentOrigin } from '@pos/contracts/deployment';
import { assertVercelEnvironment } from './src/shared/config';
if (process.env.VERCEL === '1') assertVercelEnvironment(process.env);
const liveOrigin = new URL(
  realtimeUrl(
    tenantDeploymentOrigin(process.env),
    process.env.TENANT_REALTIME_URL,
    process.env.NODE_ENV !== 'production',
  ),
).origin;
const config: NextConfig = {
  transpilePackages: ['@pos/ui', '@pos/contracts'],
  outputFileTracingRoot: resolve(__dirname, '../..'),
  poweredByHeader: false,
  async redirects() {
    const origin = new URL(process.env.TENANT_ORIGIN ?? 'http://127.0.0.1:3000');
    if (
      process.env.NODE_ENV !== 'development' ||
      origin.hostname !== '127.0.0.1' ||
      origin.protocol !== 'http:'
    )
      return [];
    return [
      {
        source: '/:path((?!api(?:/|$)).*)',
        has: [{ type: 'host', value: 'localhost' }],
        destination: `${origin.origin}/:path`,
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/courier-sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${liveOrigin}; frame-ancestors 'none'; form-action 'self'; base-uri 'self'`,
          },
        ],
      },
    ];
  },
};
export default config;
