import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { WebSocket } from 'ws';
import './api/support/harness';
import { createTenantServer } from '../apps/api/src/app/tenant-server';

it('HTTP server Vercel: cookie tenant, platformă absentă și Origin WebSocket invalid refuzat', async () => {
  const { server, realtime } = await createTenantServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    expect((await fetch(`${base}/api/platform/auth/session`)).status).toBe(404);
    const session = await fetch(`${base}/api/tenant/auth/session`);
    expect(session.status).toBe(200);
    expect(session.headers.getSetCookie().every((cookie) => !cookie.includes('Domain='))).toBe(
      true,
    );
    const rejected = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(`${base.replace('http:', 'ws:')}/api/tenant/realtime`, {
        origin: 'https://foreign.example.com',
      });
      ws.once('unexpected-response', (_request, response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
        ws.terminate();
      });
      ws.once('error', reject);
    });
    expect(rejected).toBe(403);
  } finally {
    await realtime.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
