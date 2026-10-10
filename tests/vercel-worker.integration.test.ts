import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { enqueueJob, getJob } from '../packages/jobs/src/index';
import { createSecurityFixture } from '../packages/db/test/fixtures/security.fixture';
import { createWorkerApp } from '../apps/worker/src/app/job-server';

it('cronul Vercel folosește rolul worker real și refuză cererile fără secret', async () => {
  const workerUrl = new URL(process.env.WORKER_DATABASE_URL!);
  if (!['127.0.0.1', 'localhost'].includes(workerUrl.hostname)) throw new Error('Numai DB locală.');
  workerUrl.pathname = '/pos_test';
  process.env.WORKER_DATABASE_URL = workerUrl.toString();
  process.env.CRON_SECRET = `synthetic-${randomUUID()}`;
  const fixture = await createSecurityFixture();
  const server = createWorkerApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const job = await fixture.txA((tx) =>
      enqueueJob(tx, {
        organizationId: fixture.a.organization.id,
        kind: 'maintenance.database_health',
        idempotencyKey: randomUUID(),
        payload: { source: 'vercel-test' },
      }),
    );
    expect((await fetch(`${base}/api/internal/jobs`)).status).toBe(401);
    expect((await fetch(`${base}/api/platform/auth/session`)).status).toBe(404);
    // Other synthetic maintenance jobs may be ahead in the shared test queue.
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await fetch(`${base}/api/internal/jobs`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      expect(response.status).toBe(200);
      if ((await fixture.txA((tx) => getJob(tx, job.id)))?.status === 'COMPLETED') break;
    }
    expect((await fixture.txA((tx) => getJob(tx, job.id)))?.status).toBe('COMPLETED');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.all([
      fixture.runtime.$disconnect(),
      fixture.platform.$disconnect(),
      fixture.auth.$disconnect(),
    ]);
  }
});
