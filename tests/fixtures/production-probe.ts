import { createApp } from '../../apps/api/src/server';
import type { AddressInfo } from 'node:net';
let privateBlocked = false;
try {
  createApp('PLATFORM');
} catch {
  privateBlocked = true;
}
const server = createApp('TENANT').listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
try {
  const response = await fetch(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tenant/auth/session`,
  );
  const cookies = response.headers.getSetCookie();
  console.log(
    JSON.stringify({
      privateBlocked,
      status: response.status,
      cookieFlags: cookies.map((cookie) =>
        cookie
          .split(';')
          .slice(1)
          .map((flag) => flag.trim()),
      ),
    }),
  );
} finally {
  server.closeAllConnections();
  server.close();
}
