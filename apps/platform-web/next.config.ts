import type { NextConfig } from 'next';
if (process.env.VERCEL === '1')
  throw new Error(
    'Platforma privată nu se construiește pe Vercel; folosiți entrypointul VPS privat.',
  );
const config: NextConfig = {
  transpilePackages: ['@pos/ui'],
  poweredByHeader: false,
  async redirects() {
    const origin = new URL(process.env.PLATFORM_ORIGIN ?? 'http://127.0.0.1:3001');
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
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'`,
          },
        ],
      },
    ];
  },
};
export default config;
