import { createServer } from 'node:http';
import { assertRuntimeDatabaseRole } from '@pos/db';
import { attachTenantRealtime } from '../features/realtime';
import { runtime } from '../shared/db';
import { createApp } from './create-app';
import { TENANT_REALTIME_READY_TIMEOUT_MS } from './config/http.constants';

export async function createTenantServer() {
  await assertRuntimeDatabaseRole(runtime);
  const server = createServer(createApp('TENANT'));
  const realtime = attachTenantRealtime(server);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      realtime.ready,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Realtime PostgreSQL indisponibil.')),
          TENANT_REALTIME_READY_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    await realtime.close();
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  return { server, realtime };
}
